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
    console.log(JSON.stringify({verdict:indicators.length?"NO_GO":"NO_FINDINGS",
      findingCount:indicators.length,indicators,
      secretValuesIncluded:false,classification:"SECURITY_REVIEW_REQUIRED"},null,2));
    if(indicators.length)process.exitCode=2;
  }
}
