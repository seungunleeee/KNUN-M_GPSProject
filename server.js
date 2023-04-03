const express = require("express");
const app = express();
const router = express.Router();
const redis = require("redis");
const socketIO = require("socket.io");
let dhcpUrl = "redis://localhost:6379";

const client = redis.createClient({
  url: dhcpUrl,
});

class Redis {
  constructor() {
    this.redisClient = redis.createClient({
      url: dhcpUrl,
    });
    // this.redisClient.on("connect", () => {
    //   console.info("Redis PubSub connected!");
    // });
    this.redisClient.on("error", (err) => {
      console.error("Redis PubSub Client Error", err);
    });

    //  redis v4 연결 (비동기)
    this.redisClient.connect().then(() => {
      console.log("Redis PubSub connected!");
    });
  }

  // 이밖의 명령어 ...
}

class PubSub extends Redis {
  constructor() {
    super();
  }

  async subscribe(channel) {
    await this.redisClient.subscribe(channel, (message) => {
      console.log("Line 75 message : ", message);
    });
    console.log("채널 연결 완료");
  }

  async unsubscribe(channel) {
    await this.redisClient.unsubscribe(channel);
  }

  async pSubscribe(channel) {
    await this.redisClient.pSubscribe(channel, (message, channel) => {
      console.log("channel : %s , message : %s", channel, message);
    });
    console.log("채널(패턴) 연결 완료");
  }

  async pUnsubscribe(channel) {
    await this.redisClient.pUnsubscribe(channel);
  }

  async publish(channel, message) {
    await this.redisClient.publish(channel, message);
  }
}

async function run() {
  await client.connect().then(() => {
    console.log("redis 연결됨");
  });
}

// run();

client.on("connect", () => {
  console.info("Redis connected");
});
client.on("error", (err) => {
  console.error("Redis Client Error", err);
});

app.use(express.json());
app.use(
  express.urlencoded({
    extended: true,
  })
);
const server = app.listen(8080, function () {
  console.log("listening on port 8080");
});

const subscriber = new PubSub(); // 구독자
const publisher = new PubSub(); // 발행자

//FLOW4
// publisher가 소켓 연결시에 실행되는 코드.
const io = socketIO(server, { path: "/socket.io" });
//FLOW5 소켓 연결후에 실행되는 코드
//연결이된 상태일 경우이벤트 = "connection"임
io.on("connection", (socket) => {
  // connection 콜백함수 시작

  socket.on("disconnect", () => {
    //disconnection 콜백함수
    console.log("publisher 접속 헤제");
    clearInterval(socket.interval);
  });

  socket.on("error", (error) => {
    //error 콜백함수
    console.error(error);
  });

  //FLOW6 클라이언트로부터 메시지 수신
  // FLOW7은 Subscriber.html에 있습니다.
  socket.on("currentGps", (data) => {
    //currentGps 콜백함수
    console.log(data);
    console.log(typeof data);

    let parsedJsonData = JSON.parse(data);
    console.log(parsedJsonData);
    let 도시 = parsedJsonData["도시"];
    let 지역구 = parsedJsonData["지역구"];
    let 동 = parsedJsonData["동"];
    let gps = parsedJsonData["gps"];
    let 라이더이름 = parsedJsonData["라이더이름"];
    console.log("배달라이더분들한태온 gps정보 -> ", gps);
    //data == gps임 gps가 1이면 범어동

    (async (publisher) => {
      const client = publisher.redisClient;
      const localSubscriber = client.duplicate();
      await localSubscriber.connect();
      await publisher.publish(
        `/${도시}/${지역구}/${동}`, // <--- ex) /대구시/수성구/범어동 == 채널임 , 이거 전체가 하나의 체널임.
        `라이더 지역정보 : ${도시}_${지역구}_${동} 라이더이름 : ${라이더이름} 라이더 gps : ${gps}` // <----- /대구시/수성구/범어동(채널) 에 보낼 메세지임.
      );
      // 함수선언끝
    })(publisher);
  });
});

// publisher 에서 요청하는 코드 끝

//FLOW9 클라이언트로 부터 SSE 요청받음
app.get("/message/:city/:district", async function (req, res) {
  //FLOW10 관제웹의 SSE연결을 위한 최초요청시에 res.writeHead를 아래와 같이 보내서 노드서버와 관제웹의 연결을 유지시킴
  res.writeHead(200, {
    Connection: "keep-alive",
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
  });
  // 연결후 node.js에서 관제웹으로 push하는 예제
  res.write("event: ServerPUSH\n");
  res.write(
    `data: ${"초기연결 완료 , 재연결시에도 발생하는 메세지입니다."}\n\n`
  );

  //함수선언 시작
  //FLOW11
  // 함수 선언 시작 , node.js서버에서 redis에 채널 구독하는 함수.
  (async (도시, 지역구, res) => {
    //비동기 처리 await를 포함하는 함수는 async써야함
    const client = subscriber.redisClient; //subscriber == line:90에 선언되어있습니다.
    // 원본 subscriber 소켓 디스크럽터를 복사 =====> 확실하지 않음 여쭤봐야함
    const localSubscriber = client.duplicate();
    // 복사된 소켓디스크럽터로 연결
    await localSubscriber.connect();
    //FLOW12 복사된 소켓 디스크럽터로 채널 구독 , 구독한 채널로 데이터가 전송(publish)될 경우 아래 함수가 실행됨.
    //다음 FLOW13 은 subscriber.html에 있습니다.
    await localSubscriber.pSubscribe(`/${도시}/${지역구}*`, (message) => {
      //async를 하지않고 await를 사용했을 경우 읽고 지나감
      console.log("message수신");
      res.write("event: ServerPUSH\n");
      res.write(`data: ${message}\n\n`); //\n\n 버퍼에 있는 메세지를 노드에서 클라이언트로
    });
    // 함수선언끝
  })(req.params.city, req.params.district, res); //여기서 함수 실행 res는 관제웹에 데이터를 보내주기 위해 매개변수로보냄.
});

//정적 파일 처리입니다.
app.get("/subscriber", function (req, res) {
  res.sendFile(__dirname + "/subscriber.html");
});

app.get("/publisher", function (req, res) {
  res.sendFile(__dirname + "/publisher.html");
});

app.get("/css/style.css", function (req, res) {
  res.sendFile(__dirname + "/css/style.css");
});

app.get("/img/profile.png", function (req, res) {
  res.sendFile(__dirname + "/img/profile.png");
});
