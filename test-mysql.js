const mysql = require('mysql2');

const connection = mysql.createConnection({
  host: '127.0.0.1',
  port: 3399,
  user: 'sspcnhpfsd',
  password: '6RKxGW7BwV',
  database: 'sspcnhpfsd'
});

connection.connect((err) => {
  if (err) {
    console.error('error connecting: ' + err.stack);
    return;
  }
  console.log('connected as id ' + connection.threadId);
  connection.end();
});
