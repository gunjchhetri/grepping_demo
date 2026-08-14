/* global process, URL, console */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.argv[2] ? pathToFileURL(process.argv[2].replace(/\/?$/, "/")) : new URL("../data/sapc02_transcripts/", import.meta.url);
const outRoot = process.argv[3] ? pathToFileURL(process.argv[3].replace(/\/?$/, "/")) : new URL("../data/", import.meta.url);
const outputPrefix = process.argv[4] ?? "sapc02";
await mkdir(outRoot, { recursive: true });
const examCode = "SAP-C02";

const numberWords = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

const questionMarker = /\bquestion\s+(one|two|three|four|five|six|seven|eight|nine|ten|\d{1,3})\s*[,.:]?/gi;
const optionMarker = /(?:^|\s)(A|B|C|D|E|F|Eight)(?:[.:,])?\s+/g;
const explanationStart = /\b(?:all right|alright|let['’]?s analyze|this question|this problem|the core task|the key (?:challenge|concept|point)|with that foundation|we need to|now let['’]?s evaluate)\b/i;

function numberOf(value) {
  const normalized = value.toLowerCase();
  return numberWords[normalized] ?? Number(normalized);
}

function normalizeText(value) {
  return value
    .replace(/\[[^\]]+\]\s*/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\bSAP\s*C\s*0?2\b/gi, "SAP-C02")
    .replace(/\bAWS\s+sightto[- ]sight\s+VPN\b/gi, "AWS Site-to-Site VPN")
    .replace(/\bclientVPN\b/gi, "Client VPN")
    .trim();
}

function answerLetters(section) {
  const matches = [...section.matchAll(/correct\s+(?:answer|answers|solution|solutions|choice|choices|combination|actions)(?:\s+of\s+[^.!?\n]{1,160})?\s+(?:is|are)\s+([^.!?\n]{1,120})/gi)];
  if (matches.length) {
    const answerText = matches.at(-1)[1];
    const letters = [...answerText.matchAll(/\b([A-F])\b/gi)].map((m) => m[1].toUpperCase());
    if (letters.length) return [...new Set(letters)].join(",");
    if (/^a\b/i.test(answerText)) return "A";
  }
  const markedCorrect = [
    ...section.matchAll(/\b([A-F])(?:\.|:|,)\s+[\s\S]{0,900}?\b(?:is\s+)?the\s+correct\s+(?:answer|choice|solution)\b/gi),
    ...section.matchAll(/\bOption\s+([A-F])\b[\s\S]{0,500}?\bis\s+the\s+correct\s+(?:answer|choice|solution)\b/gi),
  ];
  if (markedCorrect.length) return markedCorrect.at(-1)[1].toUpperCase();
  return "";
}

function inferTopic(text) {
  const t = text.toLowerCase();
  const rules = [
    ["Task 1.1: Architect network connectivity strategies.", /(vpc|vpn|direct connect|route table|network firewall|private link|transit gateway|dns|route 53|gateway load balancer|subnet|peering|resolver|connectivity)/],
    ["Task 1.2: Prescribe security controls.", /(iam|identity|kms|key management|encrypt|security group|network acl|waf|shield|guardduty|macie|certificate|access analyzer)/],
    ["Task 1.3: Design reliable and resilient architectures.", /(disaster recovery|failover|rto|rpo|backup|restore|resilien|availability|outage|recovery|pilot light|warm standby)/],
    ["Task 1.4: Design a multi-account AWS environment.", /(organizations|organizational|account factory|control tower|multi.?account|scp|service control policy|ram|resource access manager|central logging)/],
    ["Task 1.5: Determine cost optimization and visibility strategies.", /(cost|pricing|reserved instance|savings plan|spot|budget|trusted advisor|compute optimizer|storage lens|cost.?effective|least expensive|cheapest)/],
    ["Task 2.1: Design a deployment strategy to meet business requirements.", /(cloudformation|infrastructure as code|ci.?cd|codepipeline|code deploy|deployment|rollback|blue.?green|rolling|canary)/],
    ["Task 2.2: Design a solution to ensure business continuity.", /(business continuity|multi.?region|replication|backup|restore|route 53 failover|disaster recovery)/],
    ["Task 2.3: Determine security controls based on requirements.", /(waf|shield|iam|least privilege|patch|endpoint|credential|secret|security|encrypt|certificate)/],
    ["Task 2.4: Design a strategy to meet reliability requirements.", /(high availability|autoscal|self.?healing|loosely coupled|sqs|sns|step functions|service quota|dns routing|multi.?az)/],
    ["Task 2.5: Design a solution to meet performance objectives.", /(performance|latency|throughput|caching|buffer|replica|instance famil|purpose.?built|large.?scale)/],
    ["Task 2.6: Determine a cost optimization strategy to meet solution goals and objectives.", /(data transfer cost|storage tier|rightsiz|savings plan|reserved instance|spot|pricing model|expenditure)/],
    ["Task 3.1: Determine a strategy to improve overall operational excellence.", /(cloudwatch|cloudtrail|config|systems manager|ssm|monitor|logging|observability|operations|remediation|deployment process)/],
    ["Task 3.2: Determine a strategy to improve security.", /(secrets manager|patching|backup process|least privilege|vulnerability|security hub|remediation|traceability)/],
    ["Task 3.3: Determine a strategy to improve performance.", /(bottleneck|global accelerator|cloudfront|kpi|sla|performance improvement|rightsiz)/],
    ["Task 3.4: Determine a strategy to improve reliability.", /(single point of failure|replication|self.?healing|elastic feature|reliable|resilient|failover)/],
    ["Task 3.5: Identify opportunities for cost optimizations.", /(underutilized|overutilized|cost and usage report|billing alarm|tagging|unused resource)/],
    ["Task 4.1: Select existing workloads and processes for potential migration.", /(migration evaluator|migration hub|inventory|portfolio|asset planning|wave planning|tco)/],
    ["Task 4.2: Determine the optimal migration approach for existing workloads.", /(7r|rehost|replatform|repurchase|refactor|retire|retain|snowball|database migration|application migration service|migrate)/],
    ["Task 4.3: Determine a new architecture for existing workloads.", /(new architecture|rearchitect|redesign|serverless|container|decouple|modern architecture)/],
    ["Task 4.4: Determine opportunities for modernization and enhancements.", /(moderniz|enhancement|managed service|lambda|fargate|eks|event.?driven|improve existing)/],
  ];
  return rules.find(([, pattern]) => pattern.test(t))?.[0] ?? "Task 2.5: Design a solution to meet performance objectives.";
}

function parseQuestions(sourceText, sourceVideoId) {
  const text = normalizeText(sourceText);
  const starts = [...text.matchAll(questionMarker)];
  const sourceTimestamps = [...sourceText.matchAll(/\[(\d+:\d+)\][\s\S]{0,120}?\bquestion\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|\d{1,3})\b/gi)].map((match) => [...match[0].matchAll(/\[(\d+:\d+)\]/g)].at(-1)?.[1] ?? match[1]);
  const questions = [];
  for (let i = 0; i < starts.length; i += 1) {
    const start = starts[i].index;
    const end = starts[i + 1]?.index ?? text.length;
    const section = text.slice(start, end).trim();
    const marker = starts[i][1];
    const number = numberOf(marker);
    const afterMarker = section.replace(questionMarker, (match) => match === starts[i][0] ? "" : match).trim();
    const questionMark = afterMarker.search(/\?\s+/);
    const optionAreaStart = questionMark >= 0 ? questionMark + afterMarker.slice(questionMark).search(/\s+/) + 1 : 0;
    const optionArea = afterMarker.slice(optionAreaStart).trim();
    const optionMatches = [...optionArea.matchAll(optionMarker)].filter((match) => {
      const hasLabelPunctuation = /[.:,]\s+$/.test(match[0]);
      const prefix = optionArea.slice(Math.max(0, match.index - 12), match.index);
      return hasLabelPunctuation || /\bOption\s*$/i.test(prefix) || match[1] === "Eight";
    });
    if (!optionMatches.length) {
      questions.push({ exam_code: examCode, question_number: number, topic: inferTopic(afterMarker), question: afterMarker, option_a: "", option_b: "", option_c: "", option_d: "", option_e: "", option_f: "", correct_answer: answerLetters(section), source_video_id: sourceVideoId, source_timestamp: sourceTimestamps[i] ?? "", parse_status: "no_option_markers" });
      continue;
    }
    const firstOption = optionMatches[0].index;
    const questionText = (afterMarker.slice(0, optionAreaStart) + optionArea.slice(0, firstOption)).trim();
    const options = {};
    if (optionMatches[0][1] !== "A" && optionMatches[0][1] !== "Eight" && optionArea.slice(0, firstOption).trim().length > 20) {
      options.a = optionArea.slice(0, firstOption).trim();
    }
    for (let j = 0; j < optionMatches.length; j += 1) {
      const current = optionMatches[j];
      const letter = current[1] === "Eight" ? "a" : current[1].toLowerCase();
      const contentStart = current.index + current[0].length;
      const contentEnd = optionMatches[j + 1]?.index ?? afterMarker.length;
      let content = optionArea.slice(contentStart, contentEnd).trim();
      const explanationIndex = content.search(explanationStart);
      if (explanationIndex >= 0) content = content.slice(0, explanationIndex).trim();
      if (!options[letter]) options[letter] = content;
    }
    const sourceTimestamp = sourceTimestamps[i] ?? "";
    questions.push({
      exam_code: examCode,
      question_number: number,
      topic: inferTopic(questionText),
      question: questionText,
      option_a: options.a ?? "",
      option_b: options.b ?? "",
      option_c: options.c ?? "",
      option_d: options.d ?? "",
      option_e: options.e ?? "",
      option_f: options.f ?? "",
      correct_answer: answerLetters(section),
      source_video_id: sourceVideoId,
      source_timestamp: sourceTimestamp,
      parse_status: "parsed",
    });
  }
  return questions;
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(rows, columns) {
  return [columns.join(","), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(","))].join("\n") + "\n";
}

const files = (await readdir(root)).filter((file) => file.endsWith(".txt")).sort();
const questions = [];
for (const file of files) {
  const sourceVideoId = basename(file, ".txt");
  questions.push(...parseQuestions(await readFile(join(root.pathname, file), "utf8"), sourceVideoId));
}
questions.sort((a, b) => a.question_number - b.question_number || a.source_video_id.localeCompare(b.source_video_id));

const adminColumns = ["exam_code", "topic", "question", "option_a", "option_b", "option_c", "option_d", "option_e", "option_f", "correct_answer"];
const sourceColumns = [...adminColumns, "question_number", "source_video_id", "source_timestamp", "parse_status"];
await writeFile(new URL(`${outputPrefix}_questions_admin.csv`, outRoot), toCsv(questions, adminColumns), "utf8");
await writeFile(new URL(`${outputPrefix}_questions_with_sources.csv`, outRoot), toCsv(questions, sourceColumns), "utf8");
await writeFile(new URL(`${outputPrefix}_questions.json`, outRoot), JSON.stringify(questions, null, 2), "utf8");
console.log(JSON.stringify({ files: files.length, questions: questions.length, numbered: new Set(questions.map((q) => q.question_number)).size, missingAnswers: questions.filter((q) => !q.correct_answer).length, missingOptions: questions.filter((q) => !q.option_a || !q.option_b || !q.option_c || !q.option_d).length, statusCounts: Object.fromEntries([...new Set(questions.map((q) => q.parse_status))].map((s) => [s, questions.filter((q) => q.parse_status === s).length])) }, null, 2));
