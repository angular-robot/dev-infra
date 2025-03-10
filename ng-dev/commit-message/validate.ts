/**
 * @license
 * Copyright Google LLC
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {getConfig} from '../utils/config.js';
import {Log} from '../utils/logging.js';

import {assertValidCommitMessageConfig, COMMIT_TYPES, ScopeRequirement} from './config.js';
import {Commit, parseCommitMessage} from './parse.js';

/** Options for commit message validation. */
export interface ValidateCommitMessageOptions {
  disallowSquash?: boolean;
  nonFixupCommitHeaders?: string[];
}

/** The result of a commit message validation check. */
export interface ValidateCommitMessageResult {
  valid: boolean;
  errors: string[];
  commit: Commit;
}

/** Regex matching a URL for an entire commit body line. */
const COMMIT_BODY_URL_LINE_RE = /^https?:\/\/.*$/;

/**
 * Regular expression matching potential misuse of the `BREAKING CHANGE:` marker in a
 * commit message. Commit messages containing one of the following snippets will fail:
 *
 *   - `BREAKING CHANGE <some-content>` | Here we assume the colon is missing by accident.
 *   - `BREAKING-CHANGE: <some-content>` | The wrong keyword is used here.
 *   - `BREAKING CHANGES: <some-content>` | The wrong keyword is used here.
 *   - `BREAKING-CHANGES: <some-content>` | The wrong keyword is used here.
 */
const INCORRECT_BREAKING_CHANGE_BODY_RE =
  /^(BREAKING CHANGE[^:]|BREAKING-CHANGE|BREAKING[ -]CHANGES)/m;

/**
 * Regular expression matching potential misuse of the `DEPRECATED:` marker in a commit
 * message. Commit messages containing one of the following snippets will fail:
 *
 *   - `DEPRECATED <some-content>` | Here we assume the colon is missing by accident.
 *   - `DEPRECATIONS: <some-content>` | The wrong keyword is used here.
 *   - `DEPRECATION: <some-content>` | The wrong keyword is used here.
 *   - `DEPRECATE: <some-content>` | The wrong keyword is used here.
 *   - `DEPRECATES: <some-content>` | The wrong keyword is used here.
 */
const INCORRECT_DEPRECATION_BODY_RE = /^(DEPRECATED[^:]|DEPRECATIONS?|DEPRECATE:|DEPRECATES)/m;

/** Validate a commit message against using the local repo's config. */
export async function validateCommitMessage(
  commitMsg: string | Commit,
  options: ValidateCommitMessageOptions = {},
): Promise<ValidateCommitMessageResult> {
  const _config = await getConfig();
  assertValidCommitMessageConfig(_config);
  const config = _config.commitMessage;
  const commit = typeof commitMsg === 'string' ? parseCommitMessage(commitMsg) : commitMsg;
  const errors: string[] = [];

  /** Perform the validation checks against the parsed commit. */
  function validateCommitAndCollectErrors() {
    ////////////////////////////////////
    // Checking revert, squash, fixup //
    ////////////////////////////////////

    // All revert commits are considered valid.
    if (commit.isRevert) {
      return true;
    }

    // All squashes are considered valid, as the commit will be squashed into another in
    // the git history anyway, unless the options provided to not allow squash commits.
    if (commit.isSquash) {
      if (options.disallowSquash) {
        errors.push('The commit must be manually squashed into the target commit');
        return false;
      }
      return true;
    }

    // Fixups commits are considered valid, unless nonFixupCommitHeaders are provided to check
    // against. If `nonFixupCommitHeaders` is not empty, we check whether there is a corresponding
    // non-fixup commit (i.e. a commit whose header is identical to this commit's header after
    // stripping the `fixup! ` prefix), otherwise we assume this verification will happen in another
    // check.
    if (commit.isFixup) {
      if (config.disallowFixup) {
        errors.push(
          'The commit must be manually fixed-up into the target commit as fixup commits are disallowed',
        );

        return false;
      }

      if (options.nonFixupCommitHeaders && !options.nonFixupCommitHeaders.includes(commit.header)) {
        errors.push(
          'Unable to find match for fixup commit among prior commits: ' +
            (options.nonFixupCommitHeaders.map((x) => `\n      ${x}`).join('') || '-'),
        );
        return false;
      }

      return true;
    }

    ////////////////////////////
    // Checking commit header //
    ////////////////////////////
    if (commit.header.length > config.maxLineLength) {
      errors.push(`The commit message header is longer than ${config.maxLineLength} characters`);
      return false;
    }

    if (!commit.type) {
      errors.push(`The commit message header does not match the expected format.`);
      return false;
    }

    if (COMMIT_TYPES[commit.type] === undefined) {
      errors.push(
        `'${commit.type}' is not an allowed type.\n => TYPES: ${Object.keys(COMMIT_TYPES).join(
          ', ',
        )}`,
      );
      return false;
    }

    /** The scope requirement level for the provided type of the commit message. */
    const scopeRequirementForType = COMMIT_TYPES[commit.type].scope;

    if (scopeRequirementForType === ScopeRequirement.Forbidden && commit.scope) {
      errors.push(
        `Scopes are forbidden for commits with type '${commit.type}', but a scope of '${commit.scope}' was provided.`,
      );
      return false;
    }

    if (scopeRequirementForType === ScopeRequirement.Required && !commit.scope) {
      errors.push(
        `Scopes are required for commits with type '${commit.type}', but no scope was provided.`,
      );
      return false;
    }

    if (commit.scope && !config.scopes.includes(commit.scope)) {
      errors.push(
        `'${commit.scope}' is not an allowed scope.\n => SCOPES: ${config.scopes.join(', ')}`,
      );
      return false;
    }

    // Commits with the type of `release` do not require a commit body.
    if (commit.type === 'release') {
      return true;
    }

    //////////////////////////
    // Checking commit body //
    //////////////////////////

    // Due to an issue in which conventional-commits-parser considers all parts of a commit after
    // a `#` reference to be the footer, we check the length of all of the commit content after the
    // header. In the future, we expect to be able to check only the body once the parser properly
    // handles this case.
    const allNonHeaderContent = `${commit.body.trim()}\n${commit.footer.trim()}`;

    if (
      !config.minBodyLengthTypeExcludes?.includes(commit.type) &&
      allNonHeaderContent.length < config.minBodyLength
    ) {
      errors.push(
        `The commit message body does not meet the minimum length of ${config.minBodyLength} characters`,
      );
      return false;
    }

    const bodyByLine = commit.body.split('\n');
    const lineExceedsMaxLength = bodyByLine.some((line: string) => {
      // Check if any line exceeds the max line length limit. The limit is ignored for
      // lines that just contain an URL (as these usually cannot be wrapped or shortened).
      return line.length > config.maxLineLength && !COMMIT_BODY_URL_LINE_RE.test(line);
    });

    if (lineExceedsMaxLength) {
      errors.push(
        `The commit message body contains lines greater than ${config.maxLineLength} characters.`,
      );
      return false;
    }

    // Breaking change
    // Check if the commit message contains a valid break change description.
    // https://github.com/angular/angular/blob/88fbc066775ab1a2f6a8c75f933375b46d8fa9a4/CONTRIBUTING.md#commit-message-footer
    if (INCORRECT_BREAKING_CHANGE_BODY_RE.test(commit.fullText)) {
      errors.push(`The commit message body contains an invalid breaking change note.`);
      return false;
    }

    if (INCORRECT_DEPRECATION_BODY_RE.test(commit.fullText)) {
      errors.push(`The commit message body contains an invalid deprecation note.`);
      return false;
    }

    return true;
  }

  return {valid: validateCommitAndCollectErrors(), errors, commit};
}

/** Print the error messages from the commit message validation to the console. */
export function printValidationErrors(errors: string[], print = Log.error) {
  print.group(`Error${errors.length === 1 ? '' : 's'}:`);
  errors.forEach((line) => print(line));
  print.groupEnd();
  print();
  print('The expected format for a commit is: ');
  print('<type>(<scope>): <summary>');
  print();
  print('<body>');
  print();
  print(`BREAKING CHANGE: <breaking change summary>`);
  print();
  print(`<breaking change description>`);
  print();
  print(`DEPRECATED: <deprecation summary>`);
  print();
  print(`<deprecation description>`);
  print();
  print();
}
