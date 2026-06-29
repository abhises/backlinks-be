const CONCURRENT_REQUESTS = 50;
const API_URL = 'http://localhost:4000/api/auth/register';

async function runLoadTest() {
  console.log(`Starting load test with ${CONCURRENT_REQUESTS} concurrent signups...`);
  const startTime = Date.now();
  
  const promises = [];
  
  for (let i = 0; i < CONCURRENT_REQUESTS; i++) {
    const timestamp = Date.now();
    // Unique email to avoid 409 Conflict (Email already registered)
    const email = `loadtester_${timestamp}_${i}@example.com`;
    const payload = {
      name: `Load Tester ${i}`,
      email: email,
      password: 'password123'
    };
    
    // Fire off the HTTP request asynchronously without awaiting it yet
    promises.push(
      fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })
      .then(async res => {
        const data = await res.json().catch(() => ({}));
        return { status: res.status, data };
      })
      .catch(err => {
        return { status: 'error', error: err.message };
      })
    );
  }
  
  // Wait for all 50 concurrent requests to finish
  const results = await Promise.all(promises);
  const endTime = Date.now();
  
  const duration = (endTime - startTime) / 1000;
  
  // Aggregate results
  const summary = {
    totalRequests: CONCURRENT_REQUESTS,
    successCount: 0,
    conflictCount: 0,
    errorCount: 0,
    otherCount: 0,
    durationSeconds: duration,
    requestsPerSecond: (CONCURRENT_REQUESTS / duration).toFixed(2)
  };
  
  results.forEach(result => {
    if (result.status === 201) summary.successCount++;
    else if (result.status === 409) summary.conflictCount++;
    else if (result.status === 'error' || result.status >= 500) summary.errorCount++;
    else summary.otherCount++;
  });
  
  console.log('\n--- Load Test Results ---');
  console.log(summary);
  console.log('-------------------------\n');
  
  if (summary.errorCount === CONCURRENT_REQUESTS) {
    console.log('⚠️ All requests failed. Is your backend server running on port 4000?');
  }
}

runLoadTest();
