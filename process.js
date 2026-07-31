const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');

const input = `"1f9995d2-76e3-409e-9f3f-4a2ff65f2794","nepaliko radio","nepalikoradio@gmail.com","$2b$12$JlfwnBLNezUROAEV4Y68zOEVxoJ0vqL0Cc/LpMr1q083jGJ8qvuBm","2026-06-17 15:59:36.207","CLIENT",,,"en"
"21e7602d-09ea-4593-8bf5-0a0b9647f622","climbtheserps","climbtheserps@gmail.com",,"2026-06-29 08:34:48.792","CLIENT",,,"en"
"3109a748-0c9f-4a0c-a212-403393df0c67","Alisha Bhandari","alyssa.bhandary@gmail.com",,"2026-06-25 09:25:58.762","CLIENT",,,"en"
"3c1b9242-0c07-4760-8595-99c09703c559","Alex Painter","alexpainternl@gmail.com",,"2026-05-26 16:25:35.437","CLIENT",,,"en"
"4b9dc0bf-5ca3-4681-8312-eb7b7c8f5acb","BrasQ Agency","brasqagency@gmail.com",,"2026-06-05 17:29:26.959","CLIENT",,,"en"
"4cc56071-8ed7-4be4-92c6-eca921a0e00a","Kariz Nicolas","kariznicolas@gmail.com",,"2026-06-29 08:32:13.488","ADMIN",,,"en"
"52185431-a367-4c41-ac14-bc2087ec1c80","Nabous","nabous6060@gmail.com",,"2026-06-29 15:05:51.996","CLIENT",,,"en"
"5beb576b-b6fa-4a9b-8fb5-4e6aa10610b7","Alex van Gog","vangogalex@gmail.com",,"2026-07-05 16:49:45.852","CLIENT",,,"en"
"639253a1-fd7c-4541-93ec-ce6c47ade25a","Alex v G","yougotalexmail@gmail.com",,"2026-05-22 11:37:47.094","ADMIN",,,"en"
"7456d8b9-4828-48cf-b1e8-ea4fbc9e298d","Divesh","divesh@gmail.com","$2b$12$zItFnaIyWzsMV1N.6Cy5Tufx76kSks8Y6H2tAIX0Tdx.KdcZSYjtS","2026-05-28 06:47:44.511","CLIENT",,,"en"
"86fad4d0-9968-4fc9-a120-ecffc7e9dab5","Googela01","googelaaa.01@gmail.com",,"2026-06-29 08:36:52.279","CLIENT",,,"en"
"8a82e164-8732-43be-b639-08418fd5194a","Kayy","info.xotly@gmail.com",,"2026-06-29 08:43:49.341","CLIENT",,,"en"
"8cf8cdfd-e586-4baf-b590-94dcd7fe65e1","Nepal Nepal","9860417@gmail.com",,"2026-07-17 10:40:54.293","CLIENT",,,"en"
"8fa8f7c7-70f7-41e3-80bb-5105c38b6c96","Abhises poudyal","abhisespoudyal@gmail.com","$2b$12$nsgANOQ56GYCvZcjgmcXjO0mBDLEzWIosRHqxdvJjPeXoXrcO1yoy","2026-05-22 09:46:56.138","ADMIN",,,"en"
"95f2853d-5107-4f7a-9d5b-a2f5326526f8","Alexander Trendo","trendographic@gmail.com",,"2026-05-26 16:31:33.906","CLIENT",,,"en"
"9c2e88d9-3feb-4f25-ac1c-d9cd6b8990e8","test_existing","test_existing@example.com","$2b$12$nvkJfBlcwHxax6SwY8ovKu16ET.HFkn5cMYOXqwx7.CBGPG63hFbe","2026-07-17 10:48:10.188","CLIENT",,,"en"
"add37145-426d-4bed-99ff-004269737f18","CompVert Online","compvertonline@gmail.com",,"2026-07-29 20:05:12.063","CLIENT",,,"nl"
"baf794e4-cb43-4077-b84a-db5531882798","nemo","demo@gmail","$2b$12$UajF1FEPFPkqho5XaRI78OS/jr7BLWyNS44b0tYXYq89bbqA5rxK.","2026-06-17 16:06:02.994","CLIENT",,,"en"
"c9c5ba03-e37c-4581-9288-206e6c27034d","Alexander Painter","kuvalyillustrations@gmail.com",,"2026-05-26 16:27:32.915","CLIENT",,,"en"
"fabd1c8c-b45a-4ce9-8125-472393fbb892","alexandervangog","alexandervangog@hotmail.com","$2b$12$t1T436dGZhPOHNqKcyw9l.jk.AEMqLxwwYW55RJJUw5.Zk69N/yHC","2026-07-29 20:17:12.212","CLIENT",,,"nl"
"fc97045f-c545-403d-9e5a-4dc877fd9970","98604178","98604178@gmail.com","$2b$12$B0bAxnTXZYcCahRoMyygTuXP9eGwftJh1wTlCBvITVQAPV/vlc/9y","2026-07-30 14:04:18.88","CLIENT",,,"en"`;

const records = parse(input, {
  skip_empty_lines: true
});

const reordered = records.map(r => {
  return [r[0], r[1], r[2], r[3], r[5], r[8], r[6], r[7], r[4]];
});

const output = stringify(reordered, { quoted_empty: false });
console.log(output);
