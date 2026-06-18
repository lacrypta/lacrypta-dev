#!/usr/bin/env node

const baseUrl = (process.argv[2] ?? "http://localhost:3000").replace(/\/+$/u, "");
const origin = process.argv[3] ?? "https://figus.lacrypta.dev";

const endpoints = [
  "/api/auth/email/request",
  "/api/auth/email/consume",
];

for (const endpoint of endpoints) {
  const res = await fetch(`${baseUrl}${endpoint}`, {
    method: "OPTIONS",
    headers: {
      "access-control-request-headers": "content-type",
      "access-control-request-method": "POST",
      origin,
    },
  });
  console.log(`${endpoint} ${res.status}`);
  console.log(`  access-control-allow-origin: ${res.headers.get("access-control-allow-origin") ?? "(none)"}`);
  console.log(`  access-control-allow-methods: ${res.headers.get("access-control-allow-methods") ?? "(none)"}`);
  console.log(`  access-control-allow-headers: ${res.headers.get("access-control-allow-headers") ?? "(none)"}`);
}
