/**
 * @license
 * Copyright Google LLC
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import supportsColor from 'supports-color';
import {
  spawn as _spawn,
  SpawnOptions as _SpawnOptions,
  spawnSync as _spawnSync,
  SpawnSyncOptions as _SpawnSyncOptions,
  ExecOptions as _ExecOptions,
  exec as _exec,
  ChildProcess as _ChildProcess,
} from 'child_process';
import {Log} from './logging.js';
import assert from 'assert';

export interface CommonCmdOpts {
  // Stdin text to provide to the process. The raw text will be written to `stdin` and then
  // the stream is closed. This is equivalent to the `input` option from `SpawnSyncOption`.
  input?: string;
  /** Console output mode. Defaults to "enabled". */
  mode?: 'enabled' | 'silent' | 'on-error';
  /** Whether to prevent exit codes being treated as failures. */
  suppressErrorOnFailingExitCode?: boolean;
}

/** Interface describing the options for spawning a process synchronously. */
export interface SpawnSyncOptions
  extends CommonCmdOpts,
    Omit<_SpawnSyncOptions, 'shell' | 'stdio' | 'input'> {}

/** Interface describing the options for spawning a process. */
export interface SpawnOptions extends CommonCmdOpts, Omit<_SpawnOptions, 'shell' | 'stdio'> {}

/** Interface describing the options for exec-ing a process. */
export interface ExecOptions extends CommonCmdOpts, Omit<_ExecOptions, 'shell' | 'stdio'> {}

/** Interface describing the options for spawning an interactive process. */
export interface SpawnInteractiveCommandOptions extends Omit<_SpawnOptions, 'shell' | 'stdio'> {}

/** Interface describing the result of a spawned process. */
export interface SpawnResult {
  /** Captured stdout in string format. */
  stdout: string;
  /** Captured stderr in string format. */
  stderr: string;
  /** The exit code or signal of the process. */
  status: number | NodeJS.Signals;
}

/** Interface describing the result of an exec process. */
export type ExecResult = SpawnResult;

/** Class holding utilities for spawning child processes. */
export abstract class ChildProcess {
  /**
   * Spawns a given command with the specified arguments inside an interactive shell. All process
   * stdin, stdout and stderr output is printed to the current console.
   *
   * @returns a Promise resolving on success, and rejecting on command failure with the status code.
   */
  static spawnInteractive(
    command: string,
    args: string[],
    options: SpawnInteractiveCommandOptions = {},
  ) {
    return new Promise<void>((resolve, reject) => {
      const commandText = `${command} ${args.join(' ')}`;
      Log.debug(`Executing command: ${commandText}`);
      const childProcess = _spawn(command, args, {...options, shell: true, stdio: 'inherit'});
      // The `close` event is used because the process is guaranteed to have completed writing to
      // stdout and stderr, using the `exit` event can cause inconsistent information in stdout and
      // stderr due to a race condition around exiting.
      childProcess.on('close', (status) => (status === 0 ? resolve() : reject(status)));
    });
  }

  /**
   * Spawns a given command with the specified arguments inside a shell synchronously.
   *
   * @returns The command's stdout and stderr.
   */
  static spawnSync(command: string, args: string[], options: SpawnSyncOptions = {}): SpawnResult {
    const commandText = `${command} ${args.join(' ')}`;
    const env = getEnvironmentForNonInteractiveCommand(options.env);

    Log.debug(`Executing command: ${commandText}`);

    const {
      status: exitCode,
      signal,
      stdout,
      stderr,
    } = _spawnSync(command, args, {...options, env, encoding: 'utf8', shell: true, stdio: 'pipe'});

    /** The status of the spawn result. */
    const status = statusFromExitCodeAndSignal(exitCode, signal);

    if (status === 0 || options.suppressErrorOnFailingExitCode) {
      return {status, stdout, stderr};
    }

    throw new Error(stderr);
  }

  /**
   * Spawns a given command with the specified arguments inside a shell. All process stdout
   * output is captured and returned as resolution on completion. Depending on the chosen
   * output mode, stdout/stderr output is also printed to the console, or only on error.
   *
   * @returns a Promise resolving with captured stdout and stderr on success. The promise
   *   rejects on command failure.
   */
  static spawn(command: string, args: string[], options: SpawnOptions = {}): Promise<SpawnResult> {
    const commandText = `${command} ${args.join(' ')}`;
    const env = getEnvironmentForNonInteractiveCommand(options.env);

    return processAsyncCmd(
      commandText,
      options,
      _spawn(command, args, {...options, env, shell: true, stdio: 'pipe'}),
    );
  }

  /**
   * Execs a given command with the specified arguments inside a shell. All process stdout
   * output is captured and returned as resolution on completion. Depending on the chosen
   * output mode, stdout/stderr output is also printed to the console, or only on error.
   *
   * @returns a Promise resolving with captured stdout and stderr on success. The promise
   *   rejects on command failure.
   */
  static exec(command: string, options: ExecOptions = {}): Promise<SpawnResult> {
    const env = getEnvironmentForNonInteractiveCommand(options.env);
    return processAsyncCmd(command, options, _exec(command, {...options, env}));
  }
}

/**
 * Convert the provided exitCode and signal to a single status code.
 *
 * During `exit` node provides either a `code` or `signal`, one of which is guaranteed to be
 * non-null.
 *
 * For more details see: https://nodejs.org/api/child_process.html#child_process_event_exit
 */
function statusFromExitCodeAndSignal(exitCode: number | null, signal: NodeJS.Signals | null) {
  return exitCode ?? signal ?? -1;
}

/**
 * Gets a process environment object with defaults that can be used for
 * spawning non-interactive child processes.
 *
 * Currently we enable `FORCE_COLOR` since non-interactive spawn's with
 * non-inherited `stdio` will not have colors enabled due to a missing TTY.
 */
function getEnvironmentForNonInteractiveCommand(
  userProvidedEnv?: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  // Pass through the color level from the TTY/process performing the `spawn` call.
  const forceColorValue =
    supportsColor.stdout !== false ? supportsColor.stdout.level.toString() : undefined;

  return {FORCE_COLOR: forceColorValue, ...(userProvidedEnv ?? process.env)};
}

/**
 * Process the ChildProcess object created by an async command.
 */
function processAsyncCmd(
  command: string,
  options: CommonCmdOpts,
  childProcess: _ChildProcess,
): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    let logOutput = '';
    let stdout = '';
    let stderr = '';

    Log.debug(`Executing command: ${command}`);

    // If provided, write `input` text to the process `stdin`.
    if (options.input !== undefined) {
      assert(
        childProcess.stdin,
        'Cannot write process `input` if there is no pipe `stdin` channel.',
      );
      childProcess.stdin.write(options.input);
      childProcess.stdin.end();
    }

    // Capture the stdout separately so that it can be passed as resolve value.
    // This is useful if commands return parsable stdout.
    childProcess.stderr?.on('data', (message) => {
      stderr += message;
      logOutput += message;
      // If console output is enabled, print the message directly to the stderr. Note that
      // we intentionally print all output to stderr as stdout should not be polluted.
      if (options.mode === undefined || options.mode === 'enabled') {
        process.stderr.write(message);
      }
    });

    childProcess.stdout?.on('data', (message) => {
      stdout += message;
      logOutput += message;
      // If console output is enabled, print the message directly to the stderr. Note that
      // we intentionally print all output to stderr as stdout should not be polluted.
      if (options.mode === undefined || options.mode === 'enabled') {
        process.stderr.write(message);
      }
    });

    // The `close` event is used because the process is guaranteed to have completed writing to
    // stdout and stderr, using the `exit` event can cause inconsistent information in stdout and
    // stderr due to a race condition around exiting.
    childProcess.on('close', (exitCode, signal) => {
      const exitDescription = exitCode !== null ? `exit code "${exitCode}"` : `signal "${signal}"`;
      const printFn = options.mode === 'on-error' ? Log.error : Log.debug;
      const status = statusFromExitCodeAndSignal(exitCode, signal);

      printFn(`Command "${command}" completed with ${exitDescription}.`);
      printFn(`Process output: \n${logOutput}`);

      // On success, resolve the promise. Otherwise reject with the captured stderr
      // and stdout log output if the output mode was set to `silent`.
      if (status === 0 || options.suppressErrorOnFailingExitCode) {
        resolve({stdout, stderr, status});
      } else {
        reject(options.mode === 'silent' ? logOutput : undefined);
      }
    });
  });
}
