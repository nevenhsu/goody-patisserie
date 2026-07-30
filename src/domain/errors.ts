export type ValidationIssue = {
  path: string;
  code: string;
  message: string;
};

export class DomainValidationError extends Error {
  readonly issues: readonly ValidationIssue[];

  constructor(message: string, issues: readonly ValidationIssue[] = []) {
    super(message);
    this.name = "DomainValidationError";
    this.issues = issues;
  }
}

export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`);
}
