/* global process, console */
import fs from 'node:fs';
import path from 'node:path';

const sourceDir = process.argv[2] ?? 'data/sapc02_similar_transcripts/other_channels';
const outputDir = process.argv[3] ?? 'data/sapc02_outputs/other_channels';

const topics = [
  ['Task 1.1: Architect network connectivity strategies.', ['vpc', 'vpn', 'transit gateway', 'direct connect', 'route 53', 'cloudfront', 'privatelink', 'endpoint']],
  ['Task 1.2: Prescribe security controls.', ['iam', 'kms', 'waf', 'shield', 'guardduty', 'security', 'encrypt', 'cloudtrail', 's3 bucket policy']],
  ['Task 1.3: Design reliable and resilient architectures.', ['resilien', 'fault tolerant', 'disaster recovery', 'multi-az', 'multi-region', 'backup', 'availability']],
  ['Task 1.4: Design a multi-account AWS environment.', ['organization', 'control tower', 'account', 'scp', 'resource access manager']],
  ['Task 1.5: Determine cost optimization and visibility strategies.', ['cost', 'budget', 'finops', 'savings plan', 'reserved instance']],
  ['Task 2.1: Design a deployment strategy to meet business requirements.', ['deployment', 'pipeline', 'codepipeline', 'codedeploy', 'blue green', 'canary']],
  ['Task 2.2: Design a solution to ensure business continuity.', ['business continuity', 'recovery point', 'recovery time', 'rpo', 'rto']],
  ['Task 2.3: Determine security controls based on requirements.', ['security group', 'network acl', 'least privilege', 'authentication', 'authorization']],
  ['Task 2.4: Design a strategy to meet reliability requirements.', ['step functions', 'sqs', 'sns', 'lambda', 'load balancer', 'auto scaling']],
  ['Task 2.5: Design a solution to meet performance objectives.', ['performance', 'dynamodb', 'redshift', 'elasticache', 'kinesis', 'iops', 'latency']],
  ['Task 2.6: Determine a cost optimization strategy to meet solution goals and objectives.', ['optimiz', 'storage tier', 'spot instance', 'graviton']],
  ['Task 3.1: Determine a strategy to improve overall operational excellence.', ['operational', 'operations', 'monitoring', 'observability', 'systems manager']],
  ['Task 3.2: Determine a strategy to improve security.', ['security hub', 'inspector', 'macie', 'detective']],
  ['Task 3.3: Determine a strategy to improve performance.', ['throughput', 'cache', 'scalability', 'scaling']],
  ['Task 3.4: Determine a strategy to improve reliability.', ['reliability', 'durability', 'replication', 'failover']],
  ['Task 3.5: Identify opportunities for cost optimizations.', ['cost saving', 'cost-effective', 'cheaper', 'expense']],
  ['Task 4.1: Select existing workloads and processes for potential migration.', ['migration', 'migrate', 'workload']],
  ['Task 4.2: Determine the optimal migration approach for existing workloads.', ['rehost', 'replatform', 'refactor', 'retire', 'retain', '6 rs']],
  ['Task 4.3: Determine a new architecture for existing workloads.', ['architecture', 'modernize', 'rearchitect']],
  ['Task 4.4: Determine opportunities for modernization and enhancements.', ['modernization', 'enhancement', 'serverless']],
];

const numberWords = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const ordinalWords = { second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10 };

function csv(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function normalizeWithTimestamps(raw) {
  const times = [];
  let text = '';
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*\[(\d+:\d+)\]\s*(.*)$/);
    const value = match ? match[2] : line.trim();
    if (!value) continue;
    if (text) { text += ' '; times.push(times.at(-1) ?? ''); }
    text += value;
    for (let i = 0; i < value.length; i += 1) times.push(match?.[1] ?? '');
  }
  return { text, times };
}

function markerNumber(match) {
  const value = (match[1] ?? match[2] ?? match[3] ?? '').toLowerCase();
  if (!value && /first\s+question/i.test(match[0])) return 1;
  return numberWords[value] ?? ordinalWords[value] ?? Number.parseInt(value, 10);
}

function inferTopic(question) {
  const text = question.toLowerCase();
  let best = null;
  for (const [topic, terms] of topics) {
    const score = terms.reduce((sum, term) => sum + (text.includes(term) ? 1 : 0), 0);
    if (!best || score > best.score) best = { topic, score };
  }
  return best?.score ? best.topic : 'SAP-C02: Unmapped topic (review required).';
}

function answerLetters(section) {
  const patterns = [
    /(?:the\s+)?correct\s+(?:answer|solution)\s*(?:is|:|,)?\s*(?:option\s+)?([A-D](?=\s|[.,]|$)(?:\s*(?:,|and)\s*[A-D](?=\s|[.,]|$))*)/gi,
    /option\s+([A-D])\s+is\s+the\s+correct\s+(?:answer|solution|architecture)/gi,
  ];
  const found = [];
  for (const pattern of patterns) {
    for (const match of section.matchAll(pattern)) {
      found.push(...match[1].toUpperCase().match(/[A-D]/g));
    }
  }
  return [...new Set(found)].join(',');
}

function cleanQuestion(value) {
  return value
    .replace(/^\W+/, '')
    .replace(/^make sure you subscribe.*?(?=\b(?:customer|your system)\b)/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseFile(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const { text, times } = normalizeWithTimestamps(raw);
  const marker = /\b(?:start\s+with\s+(?:the\s+)?first|question\s+number\s+(one|two|three|four|five|six|seven|eight|nine|ten|\d+)|(?:let['’]?s\s+)?move\s+on\s+to\s+(?:the\s+)?(second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|\d+(?:st|nd|rd|th))|into\s+(?:the\s+)?(second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|\d+(?:st|nd|rd|th)))\s*(?:question\b|(?=\.|,|\s))/gi;
  const starts = [...text.matchAll(marker)];
  const rows = [];
  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index];
    const end = starts[index + 1]?.index ?? text.length;
    const section = text.slice(start.index + start[0].length, end);
    const answerIndex = section.search(/(?:the\s+)?correct\s+(?:answer|solution)\b/i);
    const questionAndOptions = answerIndex >= 0 ? section.slice(0, answerIndex) : section;
    const explanationIndex = questionAndOptions.search(/\b(?:the question is|this question is|let['’]?s understand|here is how it looks|let['’]?s build the core concepts)\b/i);
    const optionSource = explanationIndex >= 0 ? questionAndOptions.slice(0, explanationIndex) : questionAndOptions;
    const optionRegex = /\b(?:option\s+)?([A-D])(?:[.,:])\s+/gi;
    const options = [];
    for (const option of optionSource.matchAll(optionRegex)) {
      options.push({ letter: option[1].toUpperCase(), index: option.index, text: option[0] });
    }
    const unique = options.filter((option, i) => options.findIndex((candidate) => candidate.letter === option.letter) === i).slice(0, 6);
    const firstOption = unique[0];
    const question = cleanQuestion(firstOption ? optionSource.slice(0, firstOption.index) : optionSource);
    const values = {};
    unique.forEach((option, i) => {
      const next = unique[i + 1]?.index ?? optionSource.length;
      values[option.letter] = optionSource.slice(option.index + option.text.length, next).replace(/\s+/g, ' ').trim();
    });
    const number = markerNumber(start);
    const status = number && question && Object.keys(values).length >= 4 && answerLetters(section) ? 'parsed' : 'review';
    rows.push({
      exam_code: 'SAP-C02',
      topic: inferTopic(question),
      question,
      option_a: values.A ?? '', option_b: values.B ?? '', option_c: values.C ?? '', option_d: values.D ?? '',
      option_e: values.E ?? '', option_f: values.F ?? '',
      correct_answer: answerLetters(section),
      question_number: number || index + 1,
      source_video_id: path.basename(file, '.txt'),
      source_timestamp: times[start.index] ?? '',
      parse_status: status,
    });
  }
  return rows;
}

const files = fs.readdirSync(sourceDir).filter((name) => name.endsWith('.txt')).sort();
const rows = files.flatMap((name) => parseFile(path.join(sourceDir, name)));
fs.mkdirSync(outputDir, { recursive: true });
const adminHeaders = ['exam_code', 'topic', 'question', 'option_a', 'option_b', 'option_c', 'option_d', 'option_e', 'option_f', 'correct_answer'];
const sourceHeaders = [...adminHeaders, 'question_number', 'source_video_id', 'source_timestamp', 'parse_status'];
const writeCsv = (filename, headers, selectedRows = rows) => fs.writeFileSync(path.join(outputDir, filename), [headers.join(','), ...selectedRows.map((row) => headers.map((header) => csv(row[header])).join(','))].join('\n') + '\n');
writeCsv('sapc02_similar_questions_admin.csv', adminHeaders, rows.filter((row) => row.parse_status === 'parsed'));
writeCsv('sapc02_similar_questions_with_sources.csv', sourceHeaders);
fs.writeFileSync(path.join(outputDir, 'sapc02_similar_questions.json'), JSON.stringify(rows, null, 2) + '\n');
console.log(JSON.stringify({ files: files.length, questions: rows.length, parsed: rows.filter((row) => row.parse_status === 'parsed').length, review: rows.filter((row) => row.parse_status !== 'parsed').length, missingOptions: rows.filter((row) => ['option_a', 'option_b', 'option_c', 'option_d'].some((key) => !row[key])).length, missingAnswers: rows.filter((row) => !row.correct_answer).length }, null, 2));
