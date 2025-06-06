/**
 * @license
 * Copyright Google LLC
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import semver from 'semver';

import {green, Log} from '../../../utils/logging.js';
import {workspaceRelativePackageJsonPath} from '../../../utils/constants.js';
import {ActiveReleaseTrains} from '../../versioning/active-release-trains.js';
import {ReleaseAction} from '../actions.js';
import {getCommitMessageForNextBranchMajorSwitch} from '../commit-message.js';
import {isFirstNextPrerelease} from '../../versioning/prerelease-version.js';
import {isVersionPublishedToNpm} from '../../versioning/npm-registry.js';
import {ReleaseConfig} from '../../config/index.js';

/**
 * Release action that configures the active next release-train to be for a major
 * version. This means that major changes can land in the next branch.
 */
export class ConfigureNextAsMajorAction extends ReleaseAction {
  private _newVersion = semver.parse(`${this.active.next.version.major + 1}.0.0-next.0`)!;

  override async getDescription() {
    const {branchName} = this.active.next;
    const newVersion = this._newVersion;
    return `Configure the "${branchName}" branch to be released as major (v${newVersion}).`;
  }

  override async perform() {
    const {branchName} = this.active.next;
    const newVersion = this._newVersion;
    const {sha: beforeStagingSha} = await this.getLatestCommitOfBranch(branchName);

    await this.assertPassingGithubStatus(beforeStagingSha, branchName);
    await this.checkoutUpstreamBranch(branchName);
    await this.updateProjectVersion(newVersion);

    await this.createCommit(getCommitMessageForNextBranchMajorSwitch(newVersion), [
      workspaceRelativePackageJsonPath,
      ...this.getAspectLockFiles(),
    ]);
    const pullRequest = await this.pushChangesToForkAndCreatePullRequest(
      branchName,
      `switch-next-to-major-${newVersion}`,
      `Configure next branch to receive major changes for v${newVersion}`,
    );

    Log.info(green('  ✓   Next branch update pull request has been created.'));

    await this.promptAndWaitForPullRequestMerged(pullRequest);
  }

  static override async isActive(active: ActiveReleaseTrains, config: ReleaseConfig) {
    // The `next` branch can be switched to a major version, unless it already
    // is targeting a new major, or if pre-releases have already started.
    return (
      !active.next.isMajor &&
      isFirstNextPrerelease(active.next.version) &&
      !(await isVersionPublishedToNpm(active.next.version, config))
    );
  }
}
