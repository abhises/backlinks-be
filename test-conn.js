const mariadb = require('mariadb');
const poolConfig = {
  host: '127.0.0.1',
  port: 3308,
  user: 'root',
  password: 'AAA',
  database: 'backlink_dev'
};

const pool = mariadb.createPool(poolConfig);
pool.getConnection()
  .then(conn => {
    console.log("Connected successfully!");
    conn.release();
    process.exit(0);
  })
  .catch(err => {
    console.error("Connection failed:", err);
    process.exit(1);
  });
