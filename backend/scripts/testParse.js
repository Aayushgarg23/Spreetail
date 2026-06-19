const fs = require('fs');
const path = require('path');
const { parseAndDetect } = require('../src/services/csvImporter');

try {
  const csvPath = path.join(__dirname, '..', '..', 'expenses_export.csv');
  console.log('Reading:', csvPath);
  const buffer = fs.readFileSync(csvPath);
  
  const knownUsers = [
    { id: '1', name: 'Aisha', email: 'aisha@spreetail.app' },
    { id: '2', name: 'Rohan', email: 'rohan@spreetail.app' },
    { id: '3', name: 'Priya', email: 'priya@spreetail.app' },
    { id: '4', name: 'Meera', email: 'meera@spreetail.app' },
    { id: '5', name: 'Dev', email: 'dev@spreetail.app' },
    { id: '6', name: 'Sam', email: 'sam@spreetail.app' }
  ];
  
  const memberships = [
    { userId: '1', joinedAt: new Date('2026-02-01'), leftAt: null },
    { userId: '2', joinedAt: new Date('2026-02-01'), leftAt: null },
    { userId: '3', joinedAt: new Date('2026-02-01'), leftAt: null },
    { userId: '4', joinedAt: new Date('2026-02-01'), leftAt: new Date('2026-03-31') },
    { userId: '5', joinedAt: new Date('2026-03-10'), leftAt: new Date('2026-03-15') },
    { userId: '6', joinedAt: new Date('2026-04-15'), leftAt: null }
  ];

  const result = parseAndDetect(buffer, knownUsers, memberships);
  console.log('Summary:', result.summary);
} catch (err) {
  console.error('Error parsing:', err.message);
  console.error(err.stack);
}
