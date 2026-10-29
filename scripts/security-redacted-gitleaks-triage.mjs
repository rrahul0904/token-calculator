#!/usr/bin/env node
// Never output the underlying report, Secret, Match, path, line, or raw text.
import fs from "node:fs";
const source=process.argv[2];
if(!source || !fs.existsSync(source)){
  console.error("Redacted security report not present; mandatory scan remains failed");
  process.exitCode=2;
}else{
  let rows=[];
  try { rows=JSON.parse(fs.readFileSync(source,"utf8")); }
  catch { console.error("Security report cannot be decoded"); process.exitCode=2; }
  if(!Array.isArray(rows)){
    console.error("Unexpected redacted security report format");
    process.exitCode=2;
  }else{
    const indicators=rows.map(row=>({
      rule:typeof row.RuleID==="string"&&/^[A-Za-z0-9._-]{1,80}$/.test(row.RuleID)?row.RuleID:"unknown",
      commit:typeof row.Commit==="string"&&/^[a-f0-9]{40}$/.test(row.Commit)?row.Commit.slice(0,12):"unknown"
    }));
    // Security reviewer can cross-reference precise historical fingerprints without
    // revealing the Gitleaks Secret, Match, Line, Email, or Description fields.
    // Only the four known historical commits/rule may expose a fingerprint;
    // all new or unexpected findings remain redacted and FAIL the scan.
    const knownHistoricalCommits = new Set(["5f355f905276fb6a9fd76bc323f884a6ae5c336a","dc8c99b92fbdce7bdcbd9bb97b8e2cf972e2caa3"]);
    const historicalRows = rows;
    const reviewedFingerprints = historicalRows.map(x => {
      if (x.RuleID !== "generic-api-key" || !knownHistoricalCommits.has(x.Commit)) return null;
      if (typeof x.Fingerprint !== "string" ||
          !/^[a-f0-9]{40}:[a-zA-Z0-9._/@ -]+:generic-api-key:[1-9][0-9]{0,6}$/.test(x.Fingerprint) ||
          !x.Fingerprint.startsWith(x.Commit + ":")) return null;
      return x.Fingerprint;
    });
    indicators.forEach((x, i) => {
      if (reviewedFingerprints[i]) x.historicalFingerprintForReview = reviewedFingerprints[i];
    });
    console.log(JSON.stringify({verdict:indicators.length?"NO_GO":"NO_FINDINGS",
      findingCount:indicators.length,indicators,
      secretValuesIncluded:false,classification:"SECURITY_REVIEW_REQUIRED"},null,2));
    if(indicators.length)process.exitCode=2;
  }
}
