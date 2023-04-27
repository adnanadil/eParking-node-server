const express = require("express");
const app = express();
const http = require("http");
const moment = require("moment");
const util = require("util");
const { Server } = require("socket.io");
const {
  initializeApp,
  applicationDefault,
  cert,
} = require("firebase-admin/app");
const {
  getFirestore,
  Timestamp,
  FieldValue,
} = require("firebase-admin/firestore");
const cors = require("cors");
const serviceAccount = require("./key.json");

app.use(cors());

const server = http.createServer(app);

initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    transports: ["websocket", "polling"],
    credentials: true,
  },
  allowEIO3: true,
  // cors: {
  //   origin: "http://localhost:3000",
  //   methods: ["GET", "POST"],
  // },
});

io.on("connection", (socket) => {
  console.log(`User Connected: ${socket.id}`);

  socket.on("join_room", (data) => {
    socket.join(data);
  });

  socket.on("send_message", (data) => {
    socket.broadcast.emit("receive_message", {
      message: data.message,
      room: "16",
    });
    // socket.to(data.room).emit("receive_message", data);
    console.log(`Message ${data.message}`);
    /*Commented this out
    socket.broadcast.emit("receive_message", data);
    updateTheChoosenParkingOnBoard(data.message);
    */

    // checkForViolation(data.message);

    // const docRef = db.collection('users').doc('alovelace');
    // postData(docRef)
    // io.broadcast.emit("receive_message", data);
  });

  socket.on("send_this", (data) => {
    // socket.to(data.room).emit("receive_message", data);
    // socket.broadcast.emit("receive_message", {message: "data.message", room: "16"});
    // This code is needed to send open command to the NodeMCU 
    socket.broadcast.emit("receive_parkings", data);
    socket.broadcast.emit("receive_message", {
      message: data.message,
      room: "16",
    });

    // This block is needed when we get an instruction from NodemMCU and we will 
    // Update the server
    checkForViolation(data.message);
    delViolations()
    // If the parking Lot is changed then we change the name to be displayed 
    // on top of the open gate button 
    updateTheChoosenParkingOnBoard(data.message);
    console.log(`Recived data: ${data.message}`)
    // io.broadcast.emit("receive_message", data);
  });

  console.log("Connected");
  console.log(socket.id);
  console.log("JWT token test: ", socket.handshake.headers);

  socket.on("disconnect", () => {
    console.log("Disconnected");
  });
});

const updateTheChoosenParkingOnBoard = async (data) => {
  let name = ""
  arr = data.split(", ");
  parkingLotID = arr.shift();
  const parkingLotRef = db.collection("parkingLots").doc(parkingLotID);
  const doc = await parkingLotRef.get();
  if (!doc.exists) {
    console.log("No such document!");
  } else {
    // console.log("Document data:", doc.data());
    name = doc.data().name;
    
    console.log(name);
  }
  const docRef = db.collection("selected").doc("jCeKiQgdMsh8BAMTgRlr");
    // const doc2 = await docRef.get();
    // if (!doc2.exists) {
    //   console.log("No such document!");
    // } else {
    //   console.log(doc2.data().selectedLot);
    // }
    await docRef.update({ selectedLot: name });
};

let parkingLotID;
let timeIn24Hours;
let minute;
let timeStamp;
let dateToSave;

const checkForViolation = (data) => {
  arr = data.split(", ");

  // Printing the converted string array
  for (i = 0; i < arr.length; i++) {
    //   console.log(JSON.stringify(arr[i]));
  }

  // This save the first element in the parkingLotID var and
  // remove it from the arary, hence arr will no longer have
  // the 0th value
  parkingLotID = arr.shift();
  // console.log(JSON.stringify(arr));

  // Looping through the remaining array and checking which parkings have true
  // value...
  var parkingsWithCars = [];
  for (i = 0; i < arr.length; i++) {
    if (arr[i] === "T") {
      parkingsWithCars.push(`P${i + 1}`);
    }
  }
  //   console.log(JSON.stringify(parkingsShownWithCars));
  getTheCurrentDateAndTime();
  console.log(`The time is: ${timeIn24Hours}`);
  console.log(`The date is: ${timeStamp}`);
  parkingsWithCars.forEach((eachParking) => {
    checkForVioloations(eachParking);
  });
};

const getTheCurrentDateAndTime = () => {
  var unixTimestamp = Date.now();
  var localDate_fromUnix = new Date(unixTimestamp).toLocaleString("en-US", {
    localeMatcher: "best fit",
    timeZoneName: "short",
  });
  // console.log(localDate_fromUnix)
  // .split(", ");
  let brokenTime = localDate_fromUnix.split(" ");
  // var currentTimeToConvert = localDate_fromUnix.slice(11, 22);
  // var currentHoursIn24hours = convertTime(currentTimeToConvert);
  dateToSave = brokenTime[0]
  var currentHoursIn24hours = convertTime(brokenTime[1] + " " +brokenTime[2]);
  timeIn24Hours = parseInt(currentHoursIn24hours);

  // const dateInString = localDate_fromUnix.slice(0, 10);
  const dateInString = brokenTime[0];
  console.log(brokenTime[0])
  timeStamp = moment(dateInString, "MM/DD/YYYY").unix();
};

const convertTime = (timeStr) => {
  const [time, modifier] = timeStr.split(" ");
  let [hours, minutes, seconds] = time.split(":");
  minute = minutes
  if (hours === "12") {
    hours = "00";
  }
  if (modifier === "PM") {
    hours = parseInt(hours, 10) + 12;
  }
  return `${hours}`;
};

const checkForVioloations = async (parkingSlotName) => {
  console.log(`The parkingLot ${parkingLotID}`);
  console.log(`The TimeStamp ${timeStamp}`);
  console.log(`The TimeInt ${timeIn24Hours + 1}`);
  console.log(`The Parking slot ${parkingSlotName}`);

  const revervationRef = db.collection(`reservations-${parkingLotID}`);
  const snapshot = await revervationRef
    .where("timeInt", "==", timeIn24Hours)
    .where("timeStamp", "==", timeStamp)
    .where("parkingSlot", "==", parkingSlotName)
    .get();
  if (snapshot.empty) {
    // There is a violation
    console.log("We don't have a booking for this slot at this time.");
    checkViloationCollection(parkingSlotName);
    // return;
  }

  snapshot.forEach((doc) => {
    console.log(doc.id, "=>", doc.data());
  });
};

const checkViloationCollection = async (parkingSlotName) => {
  // We need to check if we already have a violation for that slot
  // at that time for that parking lot.
  console.log(parkingSlotName);
  const violationRef = db.collection(`violations`);
  const snapshot = await violationRef
    .where("timeInt", "==", timeIn24Hours)
    .where("timeStamp", "==", timeStamp)
    .where("parkingSlotName", "==", parkingSlotName)
    .where("parkingLotID", "==", parkingLotID)
    .get();
  if (snapshot.empty) {
    // Violation not added in db so we will add it now
    console.log("Violation for this slot at this time is not yet added.");
    addViolation(parkingSlotName);
  } else {
    console.log("Violation for this slot at this time is already added in db.");
  }
};

const addViolation = async (parkingSlotName) => {
  const res = await db.collection("violations").add({
    parkingLotID: parkingLotID,
    parkingSlotName: parkingSlotName,
    timeStamp: timeStamp,
    timeInt: timeIn24Hours,
    minute: minute,
    date: dateToSave,
  });

  console.log("Added document with ID: ", res.id);
};

const delViolations = async () => {
  getTheCurrentDateAndTime();
  console.log(`HI: ${timeStamp}`);
  const violationRef = db.collection(`violations`);
  const snapshot = await violationRef.where("timeInt", "!=", timeIn24Hours).get();
  if (snapshot.empty) {
    // Violation not added in db so we will add it now
    console.log("We will not del violations...");
  } else {
    snapshot.forEach((doc) => {
      console.log("we will del this violation...");
      console.log(doc.id, "=>", doc.data());
      carryOutDel(doc.id);
    });
  }

  const snapshot_2 = await violationRef.where("timeStamp", "<", timeStamp).get();
  if (snapshot_2.empty) {
    // Violation not added in db so we will add it now
    console.log("We will not del violations...");
  } else {
    snapshot_2.forEach((doc) => {
      console.log("we will del this violation...");
      console.log(doc.id, "=>", doc.data());
      carryOutDel(doc.id);
    });
  }
};

const carryOutDel = async (docID) => {
  await db.collection("violations").doc(docID).delete();
};

const delReservations = async () => {
  getTheCurrentDateAndTime();
  // using this to get all parkingLot IDs..
  const parkingLots = db.collection("parkingLots");
  const snapshot_main = await parkingLots.get();
  if (snapshot_main.empty) {
    // This should not run as we have parking lots
    console.log("No matching documents.");
    return;
  }

  // For each reservations-parkingLot carry out del opeartion
  snapshot_main.forEach((doc) => {
    console.log(doc.id, "=>", doc.data());
    delEachReservation(doc.id);
  });
};

const delEachReservation = async (parkingLot) => {
  console.log(`ParkingLotID: ${parkingLot}`);
  const delReservationsRef = db.collection(`reservations-${parkingLot}`);
  const snapshot = await delReservationsRef
    .where("timeStamp", "<=", timeStamp - 86400 * 3)
    .get();
  if (snapshot.empty) {
    // We will keep these reservations so we get empty return...
    console.log("We will not del reservations..");
  } else {
    snapshot.forEach((doc) => {
      console.log(
        `we will del the reservation...in ${parkingLot} with ID ${doc.id}`
      );
      console.log(doc.id, "=>", doc.data());
      carryOutDelofReservations(parkingLot, doc.id);
    });
  }
};

const carryOutDelofReservations = async (parkingLotID, docID) => {
  await db.collection(`reservations-${parkingLotID}`).doc(docID).delete();
};

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log("SERVER IS RUNNING");
  console.log(`This is the port: ${PORT}`);
    delReservations()
    // delViolations();
});
