/// <reference types="@cloudflare/workers-types" />

interface CloudflareEnv {
  ASSETS: Fetcher;
  D1: D1Database;
  R2: R2Bucket;
  GOODY_BOOTSTRAP_SECRET: string;
  PAYLOAD_SECRET: string;
}

type Env = CloudflareEnv;
