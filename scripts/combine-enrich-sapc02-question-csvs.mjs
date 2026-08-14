/* global console */
import fs from 'node:fs';
import path from 'node:path';

const dataRoot = process.argv[2] ?? 'data';

const serviceRules = [
  ['Amazon S3', ['amazon s3', 's3 bucket', 's3 object', 's3 access point', 's3 endpoint', 's3 transfer', 's3 storage', ' s3 ']],
  ['Amazon VPC', ['amazon vpc', 'vpc', 'subnet', 'nat gateway', 'internet gateway', 'route table', 'network acl', 'vpc endpoint']],
  ['Amazon EC2', ['amazon ec2', 'ec2', 'auto scaling group', 'autoscaling', 'instance store', 'launch template', 'ami']],
  ['AWS Lambda', ['aws lambda', 'lambda function', 'lambda at edge', 'lambda']],
  ['Amazon DynamoDB', ['amazon dynamodb', 'dynamodb', 'dynamob']],
  ['Amazon RDS', ['amazon rds', 'rds database', 'rds instance', 'aurora']],
  ['Amazon CloudFront', ['amazon cloudfront', 'cloudfront']],
  ['Amazon Route 53', ['amazon route 53', 'route 53', 'route53']],
  ['AWS IAM', ['aws iam', 'iam policy', 'iam role', 'iam user', 'identity and access management']],
  ['AWS KMS', ['aws kms', 'kms key', 'customer managed key', 'key management']],
  ['AWS Organizations', ['aws organizations', 'organization', 'organizational unit', 'service control policy', 'scp']],
  ['AWS CloudTrail', ['aws cloudtrail', 'cloudtrail']],
  ['AWS WAF', ['aws waf', 'web application firewall', 'waf']],
  ['AWS Shield', ['aws shield', 'shield advanced']],
  ['AWS Secrets Manager', ['secrets manager', 'secret manager']],
  ['AWS Certificate Manager', ['certificate manager', 'acm certificate', 'acm']],
  ['AWS Transit Gateway', ['transit gateway']],
  ['AWS Direct Connect', ['direct connect']],
  ['AWS Site-to-Site VPN', ['site-to-site vpn', 'site to site vpn']],
  ['AWS PrivateLink', ['privatelink', 'interface endpoint']],
  ['AWS Global Accelerator', ['global accelerator']],
  ['AWS CloudFormation', ['cloudformation', 'cloudformation stack']],
  ['AWS CodePipeline', ['codepipeline', 'code pipeline']],
  ['AWS CodeDeploy', ['codedeploy', 'code deploy']],
  ['AWS Data Pipeline', ['aws data pipeline', 'data pipeline']],
  ['Amazon Data Firehose', ['amazon data firehose', 'kinesis data firehose', 'data firehose', 'firehose']],
  ['AWS Batch', ['aws batch', 'batch compute', 'batch job']],
  ['Elastic Load Balancing', ['application load balancer', 'network load balancer', 'gateway load balancer', 'elastic load balancer', 'load balancer', 'alb', 'nlb', 'gwlb']],
  ['AWS Systems Manager', ['systems manager', 'ssm agent', 'ssm parameter']],
  ['Amazon CloudWatch', ['amazon cloudwatch', 'cloudwatch', 'cloudwatch logs', 'cloudwatch agent']],
  ['AWS Config', ['aws config', 'config rule', 'configuration recorder']],
  ['AWS Step Functions', ['step functions', 'step function']],
  ['Amazon SQS', ['amazon sqs', 'sqs queue', 'sqs']],
  ['Amazon SNS', ['amazon sns', 'sns topic', 'sns']],
  ['Amazon EventBridge', ['eventbridge', 'cloudwatch events']],
  ['Amazon API Gateway', ['api gateway']],
  ['Amazon Kinesis', ['amazon kinesis', 'kinesis data', 'kinesis stream', 'kinesis']],
  ['Amazon Redshift', ['amazon redshift', 'redshift']],
  ['Amazon ElastiCache', ['elasticache', 'redis', 'memcached']],
  ['Amazon EFS', ['amazon efs', 'efs file system', 'efs']],
  ['Amazon EMR', ['amazon emr', 'emr cluster', 'emr']],
  ['AWS Database Migration Service', ['database migration service', 'aws dms', 'dms']],
  ['AWS Application Migration Service', ['application migration service', 'aws mgn', 'mgn']],
  ['AWS Migration Hub', ['migration hub', 'application discovery service', 'discovery service']],
  ['AWS Backup', ['aws backup', 'backup vault', 'backup plan']],
  ['AWS Cost Explorer', ['cost explorer', 'savings plan', 'reserved instance', 'cost and usage report']],
  ['AWS Transfer Family', ['transfer family', 'sftp enabled server']],
  ['AWS Storage Gateway', ['storage gateway', 'file gateway', 'volume gateway']],
  ['AWS Glue', ['aws glue', 'glue crawler', 'glue job']],
  ['Amazon OpenSearch Service', ['opensearch', 'elasticsearch']],
  ['Amazon SageMaker', ['sagemaker']],
  ['AWS IoT Core', ['iot core', 'iot device', 'iot rule', 'iot']],
  ['AWS Control Tower', ['control tower']],
  ['AWS Resource Access Manager', ['resource access manager', 'aws ram']],
  ['Amazon FSx', ['amazon fsx', 'fsx']],
  ['Amazon MQ', ['amazon mq', 'active mq']],
  ['AWS Security Hub', ['security hub']],
  ['Amazon GuardDuty', ['guardduty']],
  ['Amazon Inspector', ['inspector']],
  ['Amazon Macie', ['macie']],
];

const fallbackByTopic = [
  [/network|connectivity|vpn|vpc/i, 'Amazon VPC'],
  [/security|iam|encrypt|access control/i, 'AWS IAM'],
  [/cost|pricing|optimization/i, 'AWS Cost Explorer'],
  [/migration|modernization/i, 'AWS Migration Hub'],
  [/operational|monitor|observability/i, 'Amazon CloudWatch'],
  [/performance|latency|throughput/i, 'Amazon CloudFront'],
  [/deployment|pipeline/i, 'AWS CodePipeline'],
  [/reliability|resilien|business continuity/i, 'AWS Step Functions'],
];

const questionFocusHints = [
  [/sticky session|session affinity|application load balancer|network load balancer/i, 'Elastic Load Balancing'],
  [/streaming market data|data firehose|streaming data.*nightly/i, 'Amazon Data Firehose'],
  [/100k sensors|100,000 sensors|time series.*ingestion|sensor data.*ingestion/i, 'Amazon DynamoDB'],
  [/application discovery service|inventory.*processes.*network connections/i, 'AWS Migration Hub'],
];

// Concise adaptations of AWS's official SAP-C02 sample questions. The source
// attribution is retained in the output; these are intentionally summarized
// rather than copied as a long verbatim extract from the PDF.
const publicRows = [
  {
    examcode: 'SAP-C02', topic: 'Determine cost optimization and visibility strategies.',
    question: 'A company wants to prevent excessive spending across many AWS accounts while each business group retains control of its own account. Which solution should the architect recommend?',
    options: 'Use AWS Organizations with an SCP that blocks expensive instance types|Attach per-account IAM policies that block expensive instance types|Enable billing alerts and CloudWatch alarms for each account|Review AWS Cost Explorer reports manually in each account',
    correct: '2', explanation: 'Correct choice C. Primary service: Amazon CloudWatch. Rationale: billing alerts provide immediate spending notifications without taking control away from the business groups.', service: 'Amazon CloudWatch', source: 'AWS'
  },
  {
    examcode: 'SAP-C02', topic: 'Design a multi-account AWS environment.',
    question: 'A third-party monitoring account needs read-only access across every account in an AWS Organization. Which approach provides the access without sharing long-term credentials?',
    options: 'Create an AWS IAM Identity Center user and share its credentials|Create one IAM role only in the organization management account|Invite the monitoring account to join the organization|Deploy a CloudFormation StackSet that creates a role trusted by the monitoring account in every linked account',
    correct: '3', explanation: 'Correct choice D. Primary service: AWS CloudFormation. Rationale: StackSets can deploy the trusted read-only role consistently across all linked accounts.', service: 'AWS CloudFormation', source: 'AWS'
  },
  {
    examcode: 'SAP-C02', topic: 'Design a solution to meet performance objectives.',
    question: 'An HTML form hosted from an Amazon S3 website calls an API Gateway endpoint backed by Lambda. Which two changes allow the browser to call the API and serve the form?',
    options: 'Configure CORS on the S3 bucket|Host the form on Amazon EC2 instead|Request an API Gateway quota increase|Enable CORS on API Gateway|Configure the S3 bucket for website hosting',
    correct: '3|4', explanation: 'Correct choices D and E. Primary service: Amazon API Gateway. Rationale: API Gateway must return the required CORS headers and S3 must serve the static form through a website endpoint.', service: 'Amazon API Gateway', source: 'AWS'
  },
  {
    examcode: 'SAP-C02', topic: 'Design a solution to meet performance objectives.',
    question: 'A serverless application returns intermittent API Gateway 502 errors during traffic surges. The errors occur when Lambda concurrency reaches its quota. Which solution resolves the issue?',
    options: 'Increase the Lambda concurrency quota and alert when usage approaches the quota|Alert on API Gateway transactions per second and automatically raise the quota|Shard Cognito users across Regions|Use strongly consistent DynamoDB reads',
    correct: '0', explanation: 'Correct choice A. Primary service: AWS Lambda. Rationale: increasing the function concurrency quota removes the bottleneck, while CloudWatch alerts provide early warning.', service: 'AWS Lambda', source: 'AWS'
  },
  {
    examcode: 'SAP-C02', topic: 'Prescribe security controls.',
    question: 'An ECS cluster uses EC2 instances whose security group may allow inbound HTTPS only. How can operators manage the instances without opening SSH or another inbound port?',
    options: 'Change SSH to port 2222 and connect over SSH|Change SSH to port 2222 and use Trusted Advisor|Launch without key pairs and use Systems Manager Run Command|Launch without key pairs and use Trusted Advisor',
    correct: '2', explanation: 'Correct choice C. Primary service: AWS Systems Manager. Rationale: Run Command operates over outbound connectivity and does not require an inbound management port.', service: 'AWS Systems Manager', source: 'AWS'
  },
  {
    examcode: 'SAP-C02', topic: 'Prescribe security controls.',
    question: 'Developers must manage only development resources, while operators must manage development and production resources using one credential set. What cross-account design meets the requirement?',
    options: 'Create separate IAM users and groups in each account|Put operators in a production group from the development account|Create a production role in the development account that manages production|Create a production-account role trusted by an operations group in the development account',
    correct: '3', explanation: 'Correct choice D. Primary service: AWS IAM. Rationale: a cross-account role lets operators use one identity source while developers receive no production permissions.', service: 'AWS IAM', source: 'AWS'
  },
  {
    examcode: 'SAP-C02', topic: 'Determine a cost optimization strategy to meet solution goals and objectives.',
    question: 'A Kinesis workload assigns one shard to each device, but outlier processing runs only briefly each hour. Which two changes most reduce cost?',
    options: 'Use smaller instances in the same EC2 family|Replace the outlier Auto Scaling group with Lambda triggered by SQS|Use ten devices per Kinesis shard|Use two devices per Kinesis shard|Reduce the Auto Scaling group to one instance',
    correct: '1|3', explanation: 'Correct choices B and D. Primary service: Amazon Kinesis. Rationale: event-driven Lambda processing removes idle compute and a safe device-to-shard ratio reduces shard-hour cost.', service: 'Amazon Kinesis', source: 'AWS'
  },
  {
    examcode: 'SAP-C02', topic: 'Design a strategy to meet reliability requirements.',
    question: 'An ecommerce application posts orders to an external affiliate that becomes overloaded during promotions. Which two changes protect the application and control the affiliate request rate?',
    options: 'Invoke Lambda asynchronously without a queue|Place order data in SQS and invoke Lambda from the queue|Increase the Lambda timeout|Decrease Lambda reserved concurrency|Increase Lambda memory',
    correct: '1|3', explanation: 'Correct choices B and D. Primary service: Amazon SQS. Rationale: the queue decouples the application and reduced Lambda concurrency prevents the affiliate from being overwhelmed.', service: 'Amazon SQS', source: 'AWS'
  },
  {
    examcode: 'SAP-C02', topic: 'Design a solution to ensure business continuity.',
    question: 'A ticketing application on App Runner uses ECR images, Aurora MySQL, and Route 53. Which three changes create an active-active deployment across two Regions with minimal architectural change?',
    options: 'Replicate the ECR repository to the second Region|Create an ECR VPC endpoint in the second Region|Add a second App Runner deployment target in the same Region|Deploy App Runner in the second Region and use Route 53 latency routing|Replace Aurora with DynamoDB global tables|Use an Aurora global database with write forwarding',
    correct: '0|3|5', explanation: 'Correct choices A, D, and F. Primary service: Amazon Aurora. Rationale: regional image replication, latency-based routing, and an Aurora global database provide multi-Region active-active behavior with limited change.', service: 'Amazon Aurora', source: 'AWS'
  },
  {
    examcode: 'SAP-C02', topic: 'Design a solution to meet performance objectives.',
    question: 'A multi-tier application runs on x86 EC2 instances with an EC2-hosted MySQL database. Which two actions improve performance while minimizing operational overhead?',
    options: 'Run MySQL on multiple EC2 instances|Place the web tier behind an Application Load Balancer|Migrate MySQL to Aurora Serverless|Migrate every instance type to Graviton2|Replace the ALB with a company-managed load balancer',
    correct: '1|2', explanation: 'Correct choices B and C. Primary service: Amazon Aurora. Rationale: an ALB improves web-tier scalability and Aurora Serverless provides a managed, highly available database.', service: 'Amazon Aurora', source: 'AWS'
  },
  // Concise adaptations of public, original practice questions from Sailor.sh.
  {
    examcode: 'SAP-C02', topic: 'Design a multi-account AWS environment.',
    question: 'A company has dozens of AWS accounts and needs centralized compliance visibility, preventive controls that protect CloudTrail, and automated remediation with minimal operations. Which combination best meets the requirements?',
    options: 'AWS Organizations SCPs, an AWS Config aggregator with conformance packs, and Systems Manager Automation|AWS Control Tower guardrails, custom CloudWatch Events and Lambda code, and manual remediation|Per-account Config rules with StackSets and SNS notifications for manual review|Security Hub aggregation, Config rules, and EventBridge with Systems Manager runbooks but no preventive control',
    correct: '0', explanation: 'Correct choice A. Primary service: AWS Config. Rationale: SCPs provide prevention, Config aggregation provides centralized detection, and Systems Manager Automation handles remediation without custom remediation code.', service: 'AWS Config', source: 'Sailor.sh'
  },
  {
    examcode: 'SAP-C02', topic: 'Architect network connectivity strategies.',
    question: 'During a hybrid migration, on-premises systems must resolve private AWS names and AWS workloads must resolve on-premises names. The design should avoid self-managed DNS servers. Which approach is best?',
    options: 'Use Route 53 Resolver inbound endpoints for on-premises queries and outbound endpoints with forwarding rules for on-premises domains|Run BIND DNS servers on EC2 to forward queries in both directions|Forward directly to the VPC+2 resolver address over Direct Connect|Publish both internal domains in public Route 53 hosted zones',
    correct: '0', explanation: 'Correct choice A. Primary service: Amazon Route 53. Rationale: Resolver endpoints provide managed bidirectional hybrid DNS forwarding without operating DNS servers on EC2.', service: 'Amazon Route 53', source: 'Sailor.sh'
  },
  {
    examcode: 'SAP-C02', topic: 'Design a solution to meet performance objectives.',
    question: 'A global relational workload requires very low-latency reads, fast regional failover, and read scaling across multiple Regions. Which database design best fits?',
    options: 'RDS Multi-AZ with cross-Region read replicas|Aurora Global Database with Aurora read replicas in each Region|DynamoDB global tables with DAX|Aurora Multi-AZ with a separate Redis cache in each Region',
    correct: '1', explanation: 'Correct choice B. Primary service: Amazon Aurora. Rationale: Aurora Global Database provides cross-Region replication, regional read scaling, and managed failover for a relational workload.', service: 'Amazon Aurora', source: 'Sailor.sh'
  },
  {
    examcode: 'SAP-C02', topic: 'Design a strategy to meet reliability requirements.',
    question: 'An order-processing monolith is being split into microservices. Multiple consumers must independently receive each order event, traffic can spike sharply, and failed processing must be isolated and retried. Which architecture is best?',
    options: 'One SQS FIFO queue consumed by all microservices|An SNS topic that fans out to one SQS queue and dead-letter queue per microservice|Kinesis Data Streams with enhanced fan-out consumers|EventBridge rules that invoke Lambda directly with SQS dead-letter queues',
    correct: '1', explanation: 'Correct choice B. Primary service: Amazon SNS. Rationale: SNS-to-SQS fan-out gives each consumer an independent queue, while queue-level retries and dead-letter queues isolate failures.', service: 'Amazon SNS', source: 'Sailor.sh'
  },
  {
    examcode: 'SAP-C02', topic: 'Accelerate workload migration and modernization.',
    question: 'A company must move 80 TB from an on-premises NAS to S3 within two weeks. Only 40% of a 1 Gbps Direct Connect link is available for migration. Which approach best meets the timeline?',
    options: 'Run DataSync over the already constrained Direct Connect link|Load the data onto an AWS Snowball Edge device and ship it to AWS|Use S3 Transfer Acceleration over the public internet|Add a VPN and copy the data with the AWS CLI',
    correct: '1', explanation: 'Correct choice B. Primary service: AWS Snowball Edge. Rationale: the available network bandwidth cannot complete the transfer in time, while Snowball Edge moves the bulk data without consuming production link capacity.', service: 'AWS Snowball Edge', source: 'Sailor.sh'
  },
  // Concise adaptations of public sample questions from CertSafari.
  {
    examcode: 'SAP-C02', topic: 'Determine cost optimization and visibility strategies.',
    question: 'A batch workload uses many Spot Instances. Jobs tolerate interruptions, but frequent terminations cause delays. Which two fleet settings improve resilience while preserving Spot savings?',
    options: 'Use only the newest instance generation|Enable EC2 Capacity Rebalancing|Set a very high Spot price to prevent interruptions|Diversify across compatible instance types and families|Use only one Availability Zone',
    correct: '1|3', explanation: 'Correct choices B and D. Primary service: Amazon EC2. Rationale: Capacity Rebalancing replaces at-risk instances early, and diversification spreads capacity across multiple Spot pools.', service: 'Amazon EC2', source: 'CertSafari'
  },
  {
    examcode: 'SAP-C02', topic: 'Architect network connectivity strategies.',
    question: 'Hundreds of VPCs connect through Transit Gateway and all traffic must pass through highly available firewall appliances without changing each spoke route table. Which two actions are required?',
    options: 'Place the appliances behind a Network Load Balancer|Place the appliances behind a Gateway Load Balancer in an inspection VPC|Create a Transit Gateway attachment for the inspection VPC|Send Transit Gateway routes directly to a Gateway Load Balancer endpoint|Point every spoke route table directly at appliance ENIs|Use traffic mirroring as the inline inspection path',
    correct: '1|2', explanation: 'Correct choices B and C. Primary service: AWS Transit Gateway. Rationale: the inspection VPC connects to the hub through a Transit Gateway attachment, while Gateway Load Balancer provides transparent scalable appliance insertion.', service: 'AWS Transit Gateway', source: 'CertSafari'
  },
  {
    examcode: 'SAP-C02', topic: 'Design a solution to meet performance objectives.',
    question: 'A tightly coupled HPC application runs across EC2 instances and requires single-digit-microsecond network latency. Which two features should be used?',
    options: 'Cluster placement group|Elastic Fabric Adapter-enabled EC2 instances|Spread placement group across Availability Zones|Application Load Balancer between instances|Standard ENA only',
    correct: '0|1', explanation: 'Correct choices A and B. Primary service: Amazon EC2. Rationale: a cluster placement group keeps instances physically close, and EFA provides the specialized low-latency networking needed for HPC.', service: 'Amazon EC2', source: 'CertSafari'
  },
  {
    examcode: 'SAP-C02', topic: 'Design a multi-account AWS environment.',
    question: 'A shared-services account owns a VPC with managed directory services. Development accounts need to launch resources into shared subnets without VPC peering or Transit Gateway. Which two statements about VPC sharing are true?',
    options: 'The VPC owner shares selected subnets with participant accounts|Participants can freely change the shared VPC route tables and network ACLs|The owner and participant accounts must belong to the same AWS Organization|Participants are billed for the owner account’s NAT Gateway hourly charges|The entire VPC, rather than selected subnets, is shared',
    correct: '0|2', explanation: 'Correct choices A and C. Primary service: AWS Resource Access Manager. Rationale: RAM shares selected subnets from the owner account, and VPC sharing requires accounts in the same AWS Organization.', service: 'AWS Resource Access Manager', source: 'CertSafari'
  },
  {
    examcode: 'SAP-C02', topic: 'Design a multi-account AWS environment.',
    question: 'A central team must offer developers approved, tagged, preconfigured infrastructure stacks while preventing them from modifying the underlying resources. Which two services are the primary building blocks?',
    options: 'AWS CloudFormation|AWS Service Catalog|AWS Systems Manager|AWS Config|AWS Organizations',
    correct: '0|1', explanation: 'Correct choices A and B. Primary service: AWS Service Catalog. Rationale: CloudFormation defines the approved templates, while Service Catalog controls self-service launches, versions, and governance constraints.', service: 'AWS Service Catalog', source: 'CertSafari'
  },
];

function parseRows(csv) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    if (inQuotes) {
      if (char === '"') {
        if (csv[index + 1] === '"') { field += '"'; index += 1; }
        else inQuotes = false;
      } else field += char;
      continue;
    }
    if (char === '"') inQuotes = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && csv[index + 1] === '\n') continue;
      row.push(field); field = '';
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
    } else field += char;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

function csv(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function normalizeWide(record) {
  const options = ['a', 'b', 'c', 'd', 'e', 'f'].map((letter) => record[`option_${letter}`] ?? '').filter(Boolean);
  const letters = String(record.correct_answer ?? '').split(',').map((value) => value.trim()).filter(Boolean);
  return {
    examcode: record.exam_code ?? '',
    topic: record.topic ?? '',
    question: record.question ?? '',
    options: options.join('|'),
    correct: letters.map((letter) => letter.charCodeAt(0) - 65).join('|'),
    explanation: record.explanation ?? '',
    service: record.service ?? '',
    source: record.source ?? 'YouTube',
  };
}

function normalizeImport(record) {
  return {
    examcode: record.examcode ?? '',
    topic: record.topic ?? '',
    question: record.question ?? '',
    options: record.options ?? '',
    correct: record.correct ?? '',
    explanation: record.explanation ?? '',
    service: record.service ?? '',
    source: record.source ?? 'YouTube',
  };
}

function readQuestionRows(file) {
  const rows = parseRows(fs.readFileSync(file, 'utf8'));
  if (!rows.length) return [];
  const headers = rows[0].map((value) => value.trim().toLowerCase());
  const isWide = headers.includes('exam_code') && headers.includes('correct_answer');
  const isImport = headers.includes('examcode') && headers.includes('correct');
  if (!isWide && !isImport) return [];
  return rows.slice(1).map((cells) => {
    const record = Object.fromEntries(headers.map((header, index) => [header, (cells[index] ?? '').trim()]));
    return isWide ? normalizeWide(record) : normalizeImport(record);
  }).filter((row) => row.question && row.options && row.correct);
}

function optionValues(row) {
  return row.options.split('|').map((value) => value.trim()).filter(Boolean);
}

function termCount(text, term) {
  const escaped = term.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return text.match(new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, 'gi'))?.length ?? 0;
}

function correctIndices(row) {
  return row.correct.split('|').map((value) => Number(value)).filter((value) => Number.isInteger(value));
}

function inferService(row) {
  const options = optionValues(row);
  const correct = correctIndices(row);
  const questionHint = questionFocusHints.find(([pattern]) => pattern.test(row.question))?.[1];
  if (questionHint) return questionHint;
  const focusedText = correct.map((index) => options[index] ?? '').join(' ').toLowerCase();
  const fullText = `${row.question} ${options.join(' ')}`.toLowerCase();
  let best = { service: '', score: 0 };
  for (const [service, terms] of serviceRules) {
    const score = terms.reduce((total, term) => {
      const focusedMatches = termCount(focusedText, term);
      const fullMatches = termCount(fullText, term);
      // The selected answer is a stronger signal of the question's focus than
      // a service mentioned only in a distractor or background sentence.
      return total + (focusedMatches * 10) + fullMatches;
    }, 0);
    if (score > best.score) best = { service, score };
  }
  if (best.service) return best.service;
  return fallbackByTopic.find(([pattern]) => pattern.test(row.topic))?.[1] ?? 'Amazon EC2';
}

function summarize(value, max = 220) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .replace(/^(?:create|use|configure|deploy|enable|set up|set|select|choose)\s+/i, '')
    .trim()
    .replace(/[.。]+$/, '')
    .slice(0, max)
    .trim();
}

function makeExplanation(row, service) {
  const options = optionValues(row);
  const correct = correctIndices(row);
  const letters = correct.map((index) => String.fromCharCode(65 + index)).join(', ');
  const action = summarize(correct.map((index) => options[index] ?? '').join('; '));
  return `Correct choice${correct.length > 1 ? 's' : ''} ${letters}. Primary service: ${service}. Rationale: ${action}.`;
}

const files = [];
function collect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(full);
    else if (entry.name.endsWith('.csv') && entry.name !== 'sapc02_questions_combined_enriched_import.csv') files.push(full);
  }
}
collect(dataRoot);

const candidates = [
  ...files.flatMap((file) => readQuestionRows(file).map((row) => ({ ...row, sourceFile: file, source: row.source || 'YouTube' }))),
  ...publicRows,
];
const retained = new Map();
let duplicateCount = 0;
for (const candidate of candidates) {
  // Deliberately exact question-string matching: no fuzzy, semantic, case, or punctuation deduplication.
  const key = candidate.question;
  if (retained.has(key)) { duplicateCount += 1; continue; }
  retained.set(key, candidate);
}

const rows = [...retained.values()].map((row) => {
  const service = row.service || inferService(row);
  const topic = row.topic.replace(/^Task\s+\d+\.\d+:\s*/i, '').trim();
  return { ...row, topic, service, source: row.source || 'YouTube', explanation: row.explanation || makeExplanation(row, service) };
});
const headers = ['examcode', 'topic', 'question', 'options', 'correct', 'explanation', 'service', 'source'];
const output = [headers.join(','), ...rows.map((row) => headers.map((header) => csv(row[header])).join(','))].join('\n') + '\n';
fs.writeFileSync(path.join(dataRoot, 'sapc02_questions_combined_enriched_import.csv'), output);
fs.writeFileSync(path.join(dataRoot, 'sapc02_questions_combined_enriched.json'), JSON.stringify({ rows, sourceFiles: files, duplicateCount }, null, 2) + '\n');
console.log(JSON.stringify({ questionCsvFiles: files.length, candidateRows: candidates.length, exactDuplicateRowsRemoved: duplicateCount, retainedRows: rows.length, output: path.join(dataRoot, 'sapc02_questions_combined_enriched_import.csv') }, null, 2));
