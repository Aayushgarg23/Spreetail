const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const fetch = require('node-fetch'); // we have node-fetch in package.json

async function testUpload() {
  try {
    // 1. Login to get token
    const loginRes = await fetch('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'aisha@spreetail.app', password: 'Spreetail@2024' })
    });
    const { token } = await loginRes.json();
    console.log('Logged in, token received');

    // 2. Get the group ID
    const groupsRes = await fetch('http://localhost:3001/api/groups', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const { groups } = await groupsRes.json();
    const groupId = groups[0].id;
    console.log('Found group ID:', groupId);

    // 3. Upload CSV
    const formData = new FormData();
    formData.append('groupId', groupId);
    formData.append('file', fs.createReadStream(path.join(__dirname, '..', 'expenses_export.csv')));

    const uploadRes = await fetch('http://localhost:3001/api/import/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        ...formData.getHeaders()
      },
      body: formData
    });

    const uploadData = await uploadRes.json();
    if (uploadRes.status !== 201) {
      console.error('Upload failed:', uploadData);
      return;
    }

    console.log('Upload success! Summary:', uploadData.summary);
  } catch (err) {
    console.error('Error:', err);
  }
}

testUpload();
