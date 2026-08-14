/* global console */
import fs from 'node:fs';

const main = JSON.parse(fs.readFileSync('data/sapc02_questions.json', 'utf8'));
const similar = JSON.parse(fs.readFileSync('data/sapc02_outputs/other_channels/sapc02_similar_questions.json', 'utf8'))
  .filter((row) => row.parse_status === 'parsed');

const rows = [...main, ...similar].map((row) => {
  const letters = String(row.correct_answer ?? '').split(',').map((value) => value.trim()).filter(Boolean);
  const options = ['A', 'B', 'C', 'D', 'E', 'F']
    .map((letter) => row[`option_${letter.toLowerCase()}`])
    .filter((value) => String(value ?? '').trim().length > 0)
    .map((value) => String(value).trim());
  const correct = letters.map((letter) => letter.charCodeAt(0) - 'A'.charCodeAt(0));

  return {
    examcode: 'SAP-C02',
    topic: row.topic,
    question: row.question,
    options: options.join('|'),
    correct: correct.join('|'),
    explanation: '',
    service: '',
  };
});

function csv(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function write(file, selectedRows) {
  const headers = ['examcode', 'topic', 'question', 'options', 'correct', 'explanation', 'service'];
  fs.writeFileSync(file, `${headers.join(',')}\n${selectedRows.map((row) => headers.map((header) => csv(row[header])).join(',')).join('\n')}\n`);
}

write('data/sapc02_questions_admin_import.csv', rows.slice(0, main.length));
write('data/sapc02_similar_questions_admin_import.csv', rows.slice(main.length));
write('data/sapc02_questions_all_admin_import.csv', rows);
console.log(JSON.stringify({ main: main.length, similar: similar.length, combined: rows.length }, null, 2));
