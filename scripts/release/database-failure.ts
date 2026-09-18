type DatabaseLikeError = {
  code?: unknown;
};

const SAFE_CODE = /^[A-Z0-9_]{2,32}$/;

export function classifyDatabaseReleaseFailure(error: unknown): string {
  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as DatabaseLikeError).code === "string" &&
    SAFE_CODE.test((error as DatabaseLikeError).code as string)
      ? ((error as DatabaseLikeError).code as string)
      : null;

  switch (code) {
    case "28P01":
      return "DATABASE_AUTHENTICATION_FAILED:sqlstate=28P01";
    case "3D000":
      return "DATABASE_NOT_FOUND:sqlstate=3D000";
    case "42501":
      return "DATABASE_PERMISSION_DENIED:sqlstate=42501";
    default:
      return code
        ? `DATABASE_CONNECTION_FAILED:code=${code}`
        : "DATABASE_CONNECTION_FAILED";
  }
}
