/* global console */
import fs from 'node:fs';

const main = JSON.parse(fs.readFileSync('data/sapc02_questions.json', 'utf8'));
const similar = JSON.parse(fs.readFileSync('data/sapc02_outputs/other_channels/sapc02_similar_questions.json', 'utf8'))
  .filter((row) => row.parse_status === 'parsed');
const rows = [...main, ...similar];
const adminHeaders = ['exam_code', 'topic', 'question', 'option_a', 'option_b', 'option_c', 'option_d', 'option_e', 'option_f', 'correct_answer'];
const sourceHeaders = [...adminHeaders, 'question_number', 'source_video_id', 'source_timestamp', 'parse_status'];
const csv = (value) => {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
const write = (file, headers) => fs.writeFileSync(file, `${headers.join(',')}\n${rows.map((row) => headers.map((header) => csv(row[header])).join(',')).join('\n')}\n`);
write('data/sapc02_questions_all_admin.csv', adminHeaders);
write('data/sapc02_questions_all_with_sources.csv', sourceHeaders);
console.log(JSON.stringify({ main: main.length, similar: similar.length, combined: rows.length }, null, 2));
