import * as core from '@actions/core';
import {context} from '@actions/github';
import {Octokit, RestEndpointMethodTypes} from '@octokit/rest';
import {Commit, parseCommitMessage} from '../../../ng-dev/commit-message/parse.js';
import {actionLabels, managedLabels, targetLabels} from '../../../ng-dev/pr/common/labels/index.js';
import {ANGULAR_ROBOT, getAuthTokenFor, revokeActiveInstallationToken} from '../../utils.js';
import {ManagedRepositories} from '../../../ng-dev/pr/common/labels/base.js';

/** The type of the response data for a the pull request get method on from octokit. */
type PullRequestGetData = RestEndpointMethodTypes['pulls']['get']['response']['data'];
/** A Regex matcher to match releasable branch patterns. */
const releasableBranchMatcher = /(main|\d+\.\d+\.x)/;

class PullRequestLabeling {
  /** Run the commit message based labelling process. */
  static run = async () => {
    const token = await getAuthTokenFor(ANGULAR_ROBOT);
    // TODO: remove once GHA supports node18 as a target runner for Javascript action
    const git = new Octokit({auth: token});
    try {
      const inst = new this(git);
      await inst.run();
    } finally {
      await revokeActiveInstallationToken(git);
    }
  };

  /** Area labels in the current repository */
  repoAreaLabels = new Set<string>();
  /** Labels currently applied to the PR. */
  labels = new Set<string>();
  /** All commits in the PR */
  commits: Commit[] = [];
  /** The pull request information from the github API. */
  pullRequestMetadata?: PullRequestGetData;

  private constructor(private git: Octokit) {}

  /** Run the action, and revoke the installation token on completion. */
  async run() {
    // Initialize the labels and commits before performing the action.
    await this.initialize();
    core.info(`PR #${context.issue.number}`);

    await this.commitMessageBasedLabeling();
    await this.pullRequestMetadataLabeling();
  }

  /**
   * Perform labeling based on the commit messages for the pull request.
   */
  async commitMessageBasedLabeling() {
    // Add or Remove label as appropriate for each of the supported label and commit messaage
    // combinations.
    for (const {commitCheck, name, repositories} of Object.values(managedLabels)) {
      // Only apply the logic for the repositories the Label is registered for.
      if (!repositories.includes(context.repo.repo as ManagedRepositories)) {
        continue;
      }
      const hasCommit = this.commits.some(commitCheck);
      const hasLabel = this.labels.has(name);
      core.info(`${name} | hasLabel: ${hasLabel} | hasCommit: ${hasCommit}`);

      if (hasCommit && !hasLabel) {
        await this.addLabel(name);
      }
    }

    for (const commit of this.commits) {
      const label = 'area: ' + commit.scope;
      // This validates that the commit header scope actually exists as a valid label
      // otherwise when people make mistakes with scopes in their commit headers,
      // those would be automatically turned into an area label, which would be bad.
      if (this.repoAreaLabels.has(label) && !this.labels.has(label)) {
        await this.addLabel(label);
      }
    }
  }

  /**
   * Perform labeling based on the metadata for the pull request from the Github API.
   */
  async pullRequestMetadataLabeling() {
    // If we are unable to get pull request metadata, we can shortcut and exit early.
    if (this.pullRequestMetadata === undefined) {
      return;
    }

    /** The base reference string, or target branch of the pull request. */
    const baseRef = this.pullRequestMetadata.base.ref;

    if (!releasableBranchMatcher.test(baseRef)) {
      if (this.labels.has(targetLabels.TARGET_FEATURE.name)) {
        core.info(
          `The target branch (${baseRef}) is not a releasable branch, already has "target: feature" label`,
        );
      } else {
        core.info(
          `The target branch (${baseRef}) is not a releasable branch, adding "target: feature" label`,
        );
        await this.addLabel(targetLabels.TARGET_FEATURE.name);
      }
    }

    if (this.pullRequestMetadata.draft && this.labels.has(actionLabels.ACTION_MERGE.name)) {
      core.info(`This pull request is still in draft mode, removing "action: merge" label`);
      await this.removeLabel(actionLabels.ACTION_MERGE.name);
    }
  }

  /** Remove the provided label to the pull request. */
  async removeLabel(label: string) {
    const {number: issue_number, owner, repo} = context.issue;
    try {
      await this.git.issues.removeLabel({repo, owner, issue_number, name: label});
      core.info(`Removed ${label} label from PR #${issue_number}`);
      this.labels.delete(label);
    } catch (err) {
      core.error(`Failed to remove ${label} label from PR #${issue_number}`);
      core.debug(err as string);
    }
  }

  /** Add the provided label to the pull request. */
  async addLabel(label: string) {
    const {number: issue_number, owner, repo} = context.issue;
    try {
      await this.git.issues.addLabels({repo, owner, issue_number, labels: [label]});
      core.info(`Added ${label} label to PR #${issue_number}`);
      this.labels.add(label);
    } catch (err) {
      core.error(`Failed to add ${label} label to PR #${issue_number}`);
      core.debug(err as string);
    }
  }

  /** Initialize the current labels and commits for the PR. */
  async initialize() {
    const {number, owner, repo} = context.issue;

    // retrieve full list of area labels for the repository
    await this.git
      .paginate(this.git.issues.listLabelsForRepo, {owner, repo})
      .then((labels) =>
        labels
          .filter((l) => l.name.startsWith('area: '))
          .forEach((l) => this.repoAreaLabels.add(l.name)),
      );

    await this.git
      .paginate(this.git.pulls.listCommits, {owner, pull_number: number, repo})
      .then(
        (commits) => (this.commits = commits.map(({commit}) => parseCommitMessage(commit.message))),
      );

    await this.git.issues
      .listLabelsOnIssue({issue_number: number, owner, repo})
      .then((resp) => resp.data.forEach(({name}) => this.labels.add(name)));

    await this.git.pulls.get({owner, repo, pull_number: number}).then(({data}) => {
      this.pullRequestMetadata = data;
    });
  }
}

// Only run if the action is executed in a repository within the Angular org. This is in place
// to prevent the action from actually running in a fork of a repository with this action set up.
if (context.repo.owner === 'angular') {
  PullRequestLabeling.run().catch((e: Error) => {
    console.error(e);
    core.setFailed(e.message);
  });
} else {
  core.warning(
    'Automatic labeling was skipped as this action is only meant to run ' +
      'in repos belonging to the Angular organization.',
  );
}
