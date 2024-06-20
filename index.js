require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const ejs = require("ejs");
const _ = require("lodash");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const nodemailer = require("nodemailer");
const passportLocalMongoose = require("passport-local-mongoose");
const session = require("express-session");
const { ObjectId } = require('mongoose').Types;
const PDFDocument = require('pdfkit');
const fs = require('fs');
const cron = require("node-cron");
const paypal = require("paypal-rest-sdk");
const flash = require("connect-flash");
const path = require("path");
// const { PDFDocument, StandardFonts } = require('pdf-lib');
const puppeteer = require('puppeteer');
const DateOnly = require("mongoose-dateonly")(mongoose);
const FacebookStrategy = require('passport-facebook').Strategy

const app = express();

app.set('view engine', 'ejs');

app.use(bodyParser.urlencoded({extended: true}));
app.use(express.static("public"));

app.use(session({
    secret: "secret-key",
    resave: false,
    saveUninitialized: false
  }));
  app.use(flash());
  
  app.use(passport.initialize());
  app.use(passport.session());

mongoose.connect(process.env.MONGODB_URL, { useNewUrlParser: true, useUnifiedTopology: true });


const destinationSchema = new mongoose.Schema({
    title: String,
    firstPara : String,
    firstImg : String,
    content: String,
    imagesURL: [String]
});

const Destination = mongoose.model("Destination", destinationSchema);

const destination1 = new Destination({
    title : "Hogwarts Castle",
    firstPara :"The Hogwarts castle is a wondrous structure built by wizard Gandalf and his friends in 2079 at the site of Dumb Pit, an ancient burial ground located on the edge of the world.",
    firstImg : "https://wallpaperaccess.com/full/562430.jpg",
    content : "Hogwarts Castle is a magnificent and iconic structure that serves as the primary setting for the Harry Potter series by J.K. Rowling. It is a grand and ancient castle located in the Scottish Highlands and is renowned as the school of witchcraft and wizardry, Hogwarts School of Witchcraft and Wizardry. Hogwarts Castle is a magnificent and iconic structure that serves as the primary setting for the Harry Potter series by J.K. Rowling. It is a grand and ancient castle located in the Scottish Highlands and is renowned as the school of witchcraft and wizardry, Hogwarts School of Witchcraft and Wizardry.",
    imagesURL : ["https://wallpaperaccess.com/full/1225564.jpg"]
});

// destination1.save()
// .then(()=>{
//     console.log("Destination1 saved Successfully!");
// })
// .catch((err)=>{
//     console.error(`Error while saving the data ${err}`);
// });

const usersSchema = new mongoose.Schema({
  name : String,
  username: String,
  password: String,
  role: {
    type: String,
    default: "user"
  },
  subscribed: {
    type: String,
    enum: ['false', 'true'],
    default: 'false',
  },
  subscribedemail : {
    type : String
  },
  favorites: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post'
  }],
  googleId: String,
  googleDisplayName: String,
  facebookId : String,
  facebookDisplayName : String,
  bookedFlights: [{
    flight: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Flight',
    },
    destination : {
      type : mongoose.Schema.Types.ObjectId,
      ref : "Destination"
    },
    name: String,
    mobile: String,
    passportNumber: String,
    email: String,
    departure: String,
    arrival: String,
    departureDate: Date,
    ticketPath : String
  }],
  bookedHotels: [{
    hotel: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hotel',
    },
    hotelName: String,
    checkInDate: Date,
    checkOutDate: Date,
    customerName: String,
    numberOfMembers : Number,
    occupiedRooms : Number,
    mobile: String,
    email: String,
    passportNumber: String,
    ticketPath: String,
  }],
  transactions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction',
  }],
});  
  usersSchema.plugin(passportLocalMongoose);
  
  const User = mongoose.model("User", usersSchema);
  
  // Configure passport
  passport.use(User.createStrategy());
  passport.serializeUser(function(user, done){
    done(null, user.id);
  });
  passport.deserializeUser(function(id, done){
    User.findById(id)
  .then(user => {
    done(null, user);
  })
  .catch(err => {
    done(err);
  });
  
  });
  
  passport.use(new GoogleStrategy({
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    callbackURL: "http://localhost:3000/auth/google/secrets",
    userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo"
  },
  function(accessToken, refreshToken, profile, cb) {
    User.findOne({ googleId: profile.id })
      .exec()
      .then((user) => {
        if (!user) {
          const newUser = new User({
            googleId: profile.id,
            googleDisplayName: profile.displayName,
            favorites: [],
            username : profile.emails[0].value
          });
          return newUser.save();
        } else {
          return user;
        }
      })
      .then((user) => {
        return cb(null, user);
      })
      .catch((err) => {
        return cb(err);
      });
  }
  ));
  
  passport.use(new FacebookStrategy({
    clientID: process.env.FACEBOOK_APP_ID,
    clientSecret: process.env.FACEBOOK_APP_SECRET,
    callbackURL: "http://localhost:3000/auth/facebook/secrets",
    profileFields: ['id', 'displayName'] // Adjust the profile fields as needed
  },
  function(accessToken, refreshToken, profile, cb) {
    User.findOne({ facebookId: profile.id })
      .exec()
      .then((user) => {
        if (!user) {
          const newUser = new User({
            facebookId: profile.id,
            facebookDisplayName: profile.displayName,
            favorites: []
          });
          return newUser.save();
        } else {
          return user;
        }
      })
      .then((user) => {
        return cb(null, user);
      })
      .catch((err) => {
        return cb(err);
      });
  }
  ));
  


  // Define the schedule schema
const scheduleSchema = new mongoose.Schema({
    departureDate: {
      type: Date,
      required: true,
    },
    departureTime: {
      type: String,
      required: true,
    },
    arrivalDate: {
      type: Date,
      required: true,
    },
    arrivalTime: {
      type: String,
      required: true,
    },
    availableSeats: {
      type: Number,
      required: true,
    },
  });
  
  // Define the flight schema
  const flightSchema = new mongoose.Schema({
    flightID: {
      type: String,
      required: true,
      unique: true,
    },
    departure: {
      type: String,
      required: true,
    },
    arrival: {
      type: String,
      required: true,
    },
    maxCapacity: {
      type: Number,
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
    currentStatus: {
      type: String,
      enum: ['Available', 'Sold Out'],
      default: 'Available',
    },
    schedule: [scheduleSchema], // Embed the schedule schema
  });
  
  // Create the Flight model
  const Flight = mongoose.model('Flight', flightSchema);

  const transactionSchema = new mongoose.Schema({
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    flight: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Flight',
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    date: {
      type: Date,
      default: Date.now,
    },
  });
  
  // Create the Transaction model
  const Transaction = mongoose.model('Transaction', transactionSchema);
  

  //Schema and Model for Hotels 

  const hotelsSchema = new mongoose.Schema({
    name: {
      type: String,
      required: true,
    },
    location: {
        type: String,
        required: true,
    },
    firstImg: {
      type: String,
      required: true,
    },
    firstPara: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    amenities: {
      type: [String], // Array of strings representing amenities (e.g., "Wi-Fi", "Swimming Pool")
      required: true,
    },
    pricePerNight: {
      type: Number,
      required: true,
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
      default: 3,
    },
    images: {
      type: [String], // Array of image URLs for hotel images
      
    },
    availableRooms: {
      type: Number,
      required: true,
    },
    totalRooms: {
      type: Number,
      required: true,
    },
    // Additional fields can be added based on your requirements
  });
    
  const Hotel = mongoose.model('Hotel', hotelsSchema);

  const hotel1 = new Hotel({
    name:'Grand Hyatt Regency London Marriott City Centre',
    location : "Hogwarts Castle",
    pricePerNight: '$498 per night',
    rating: 4.6,
    firstPara : "This is a great hotel with great features and highest review ever got by a hotel.",
    description : "MoreOver this hotel serves good customer service as well as great amount of amenities also in good quality so this is liked by most of our customers. Give it a try and then experience a next world of hotels",
    amenities : ["Great Lake View Hotel", "A-one Qquality Rooms with extra comfort", "Fresh and good quality food"],
    availableRooms : 1000,
    totalRooms : 1000,
    firstImg : "https://crowne-plaza-london-the-city-hotel.booked.net/data/Photos/r1326x761/14255/1425561/1425561937/Hyatt-Regency-London-Blackfriars-Hotel-Exterior.JPEG",
    images : ["https://crowne-plaza-london-the-city-hotel.booked.net/data/Photos/640x460/14255/1425562/1425562201/Hyatt-Regency-London-Blackfriars-Hotel-Exterior.JPEG"]

  });
  
  
  // hotel1.save()
  // .then(() => console.log('Hotel 1 saved successfully'))
  // .catch((err) => console.error('Error saving Hotel 1:', err));

  // Example code to create and store flight information
  const flight1 = new Flight({
    flightID: 'FL001',
    departure: 'London',
    arrival: 'Hogwarts Castle',
    maxCapacity: 100,
    price : 50,
    schedule: [
      {
        departureDate: new Date('2023-07-15'),
        departureTime: '10:00 AM',
        arrivalDate: new Date('2023-07-15'),
        arrivalTime: '12:00 PM',
        availableSeats: 100,
      },
    ],
  });
  
  const flight2 = new Flight({
    flightID: 'FL002',
    departure: 'Paris',
    arrival: 'Diagon Valley',
    maxCapacity: 150,
    price : 75,
    schedule: [
      {
        departureDate: new Date('2023-07-16'),
        departureTime: '11:00 AM',
        arrivalDate: new Date('2023-07-16'),
        arrivalTime: '2:00 PM',
        availableSeats: 150,
      },
    ],
  });
  
  // Save the flights to the database
//   flight1.save()
//     .then(() => console.log('Flight 1 saved successfully'))
//     .catch((err) => console.error('Error saving Flight 1:', err));
  
//   flight2.save()
//     .then(() => console.log('Flight 2 saved successfully'))
//     .catch((err) => console.error('Error saving Flight 2:', err));


  
  app.get("/auth/google",
    passport.authenticate("google", { scope: ["profile", "email"] })
  );
  
  app.get("/auth/google/secrets",
    passport.authenticate("google", { failureRedirect: "/login" }),
    function(req, res) {
      res.redirect("/");
    }
  );
  
  app.get('/auth/facebook',
  passport.authenticate('facebook', {scope : ['email']}));

// Facebook callback route
app.get('/auth/facebook/secrets',
  passport.authenticate('facebook', { failureRedirect: '/login' }),
  function(req, res) {
    // Successful authentication, redirect to the secrets page or any other route you desire
    res.redirect('/');
  });

const deleteOutdatedFlights = async () => {
  try {
    const eightDaysAgo = new Date();
    eightDaysAgo.setDate(eightDaysAgo.getDate() - 8);

    // Convert eightDaysAgo to the format "YYYYMMDD"
    const formattedEightDaysAgo = eightDaysAgo.toISOString().slice(0, 10).replace(/-/g, '');

    // Delete flights that have any schedule with departureDate older than formattedEightDaysAgo
    const result = await Flight.deleteMany({
      "schedule.departureDate": { $lt: formattedEightDaysAgo }
    });

    console.log(`${result.deletedCount} outdated flights deleted successfully.`);
  } catch (err) {
    console.error('Error deleting outdated flights:', err);
  }
};


// Schedule the deleteOutdatedFlights function to run daily at midnight (00:00)
cron.schedule('0 0 * * *', deleteOutdatedFlights);



app.get("/", async function(req, res) {
  try {
      const foundDestinations = await Destination.find({}).limit(8).exec();
      const foundHotels = await Hotel.find({}).limit(8).exec();

      let finalDestination = null;
      if (req.user && req.user.role === "user") {
        if(req.user.bookedFlights.length>0){
          const destination = req.user.bookedFlights[0].arrival;
          if (destination !== null) {
              finalDestination = await Destination.findOne({ title: destination }).exec();
          }
        }
      }

  
  
      // Retrieve all users from the database and populate bookedFlights and bookedHotels
      const allusers = await User.find({}).exec();
  
      // Calculate total flight profit
      var totalFlightProfit = 0;
      var totalFlightRevenue = 0;

      var totalHotelProfit = 0;
      var totalHotelRevenue = 0;

      for (const user of allusers) {
        for (const booking of user.bookedFlights) {
          const flight = booking.flight;
          try {
            const newFlight = await Flight.findOne({ _id: flight });
            if (newFlight && newFlight.price) {
              totalFlightProfit += newFlight.price*0.1;
              totalFlightRevenue += newFlight.price;

            }
          } catch (err) {
            console.log("Error occurred:", err);
          }
        }
      }
  
      // Calculate total hotel profit
      // Calculate total hotel profit
      for (const user of allusers) {
        for (const booking of user.bookedHotels) {
          const hotel = booking.hotel;
          try {
            const newHotel = await Hotel.findOne({ _id: hotel });
            if (newHotel && newHotel.pricePerNight) {
              totalHotelProfit += newHotel.pricePerNight*0.1;
              totalHotelRevenue += newHotel.pricePerNight;
            }
          } catch (err) {
            console.log("Error occurred:", err);
          }
        }
      }
      totalFlightProfit = Math.round(totalFlightProfit);
      totalHotelProfit = Math.round(totalHotelProfit);
        if (finalDestination !== null) {
          res.render("home", { destinations: foundDestinations, user: req.user, destination: finalDestination, hotels : foundHotels, totalHotelProfit : totalHotelProfit, totalFlightProfit: totalFlightProfit, totalHotelRevenue: totalHotelRevenue, totalFlightRevenue: totalFlightRevenue });
      } else {
          res.render("home", { destinations: foundDestinations, user: req.user, hotels : foundHotels, totalHotelProfit : totalHotelProfit, totalFlightProfit: totalFlightProfit, totalHotelRevenue: totalHotelRevenue, totalFlightRevenue: totalFlightRevenue});
      }
  
        // console.log(finalDestination);
    } catch (err) {
        console.log(err);
        res.status(500).send("Internal Server Error");
    }
  });



app.post("/allflights/home/search", async function(req, res) {
  try {
    const departure = req.body.departure;
    const arrival = req.body.arrival;
    const departureDate = req.body.departureDate;
    const adults = parseInt(req.body.adults);
    console.log(adults);
    const totalPassengers = adults;
    const returnDate = req.body.returnDate;

    const departureToArrivalFlights = await Flight.find({
      departure: departure,
      arrival: arrival,
      "schedule.departureDate": departureDate,
      "schedule.availableSeats": { $gte: totalPassengers }
    });

    const returnFlights = await Flight.find({
      departure: arrival,
      arrival: departure,
      "schedule.departureDate": returnDate,
      "schedule.availableSeats": { $gte: totalPassengers }
    });

    res.render("flightsearch", {
      departureToArrivalFlights: departureToArrivalFlights,
      returnFlights: returnFlights,
      user: req.user
    });
  } catch (err) {
    console.log(err);
    res.redirect("/");
  }
});

// User Sign Up
app.get("/signup", function(req, res) {
    res.render("signup", { user: req.user });
  });

app.get("/signup.html", function(req, res) {
    res.render("signup", { user: req.user });
});  
  
app.post("/signup", function (req, res) {
  const { name, username, password } = req.body;

  // Check if a user with the provided username already exists
  User.findOne({ username: username })
    .then((existingUser) => {
      if (existingUser) {
        // User already exists, redirect to login page with a message
        res.render("login", {message : "User already Exists", user : req.user});
      } else {
        // Create a new user
        const newUser = new User({ name, username });

        User.register(newUser, password)
          .then((user) => {
            passport.authenticate("local")(req, res, function () {
              res.redirect("/");
            });
          })
          .catch((err) => {
            console.log(err);
            res.redirect("/signup");
          });
      }
    })
    .catch((err) => {
      console.log(err);
      res.redirect("/signup");
    });
});

  
  // User Sign In
  app.get("/login", function(req, res) {
    const message="";
    res.render("login",{message : message, user : req.user});
  });
  
  app.post("/login", function(req, res) {
    const user = new User({
      username: req.body.username,
      password: req.body.password
    });
  
    req.login(user, function(err) {
      if (err) {
        console.log(err);
        res.redirect("/login");
      } else {
        passport.authenticate("local", function(err, user, info) {
          if (err) {
            console.log(err);
            res.redirect("/login");
          } else if (!user) {
            const message = "Invalid Credentials";
            res.render("login", { message: message, user : req.user });
          } else {
            req.logIn(user, function(err) {
              if (err) {
                console.log(err);
                res.redirect("/login");
              } else {
                const message = "";
                res.redirect("/");
              }
            });
          }
        })(req, res);
      }
    });
  });
  
  
  // User Authentication Middleware
  function isAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
      return next();
    }
    res.redirect("/login");
  }
  
  // Logout
  app.get("/logout", isAuthenticated, function(req, res) {
    req.logOut(function(err){
      if(err){
          console.log(err);
          res.redirect("/");
      }
      else{
          res.redirect("/");
      }
  });
  });

  app.get("/createadmin", async function(req, res) {
    try {
      const existingAdmin = await User.findOne({name : "Admin", username: process.env.ADMIN_USERNAME });
  
      if (!existingAdmin) {
        User.register(new User({
            name : "Admin",
          username: process.env.ADMIN_USERNAME,
          role: "admin"
        }), process.env.ADMIN_PASSWORD, function(err, admin) {
          if (err) {
            console.log(err);
            res.redirect("/");
          } else {
            console.log("Admin account created");
            res.redirect("/");
          }
        });
      } else {
        console.log("Admin account already exists");
        res.redirect("/");
      }
    } catch (err) {
      console.log(err);
      res.redirect("/");
    }
  });


//Route for checking all flights schedule.

app.get('/allflights', function(req, res) {
    Flight.find({})
      .exec()
      .then((allFlights) => {
        res.render('allflights', { allFlights: allFlights, user : req.user });
      })
      .catch((err) => {
        console.error('Error retrieving flights:', err);
        res.redirect('/');
      });
  });
  
  app.get('/allflights/:flightId', function(req, res) {
    const flightId = req.params.flightId;
  
    Flight.findById(flightId)
      .exec()
      .then((flight) => {
        if (flight) {
          res.render('flight', { flight: flight, user : req.user });
        } else {
          console.log('Flight not found');
          res.redirect('/allflights');
        }
      })
      .catch((err) => {
        console.error('Error retrieving flight:', err);
        res.redirect('/allflights');
      });
  });
  

 //Flights Redirect route form destinations
 
 app.get('/flightsearch/:destinationTitle', function(req, res) {
  const destinationTitle = req.params.destinationTitle;

  Flight.find({ arrival: { $regex: new RegExp(destinationTitle, 'i') } })
    .exec()
    .then((allFlights) => {
      res.render('allflights_destination', { allFlights: allFlights, user: req.user, destination: destinationTitle });
    })
    .catch((err) => {
      console.error('Error retrieving flights:', err);
      res.redirect('/');
    });
});

  

app.get("/alldestinations",function(req,res){
    Destination.find({})
    .exec()
    .then((foundDestinations)=>{
        res.render("alldestinations",{destinations : foundDestinations, user:req.user});
    })
    .catch((err)=>{
        console.log(err);
    });
});

app.get("/alldestinations/:destinationId",function(req,res){
    const id= req.params.destinationId;

    Destination.findById(id)
    .then((foundDestination)=>{
        res.render("destination",{destination : foundDestination, user:req.user});
    })
    .catch((err)=>{
        console.log(err);
    });
});



app.get("/newdestination",function(req,res){
    res.render("newdestination", {user:req.user});
});

app.post("/newdestination",function(req,res){
    const newTitle = req.body.destinationTitle;
    const newFirstPara = req.body.destinationFirstPara;
    const newFirstImg = req.body.firstImageLink;
    const newContent = req.body.destinationBody;
    const newImage = req.body.imageLink;

    const newDestination = new Destination({
        title : newTitle,
        firstPara : newFirstPara,
        firstImg : newFirstImg,
        content: newContent
    });
    
    if (newImage) {
        newDestination.imagesURL = [req.body.imageLink];
      }
    newDestination.save();
    res.redirect("/alldestinations");
});

// GET route for searching
// GET route for searching
app.get("/search/:title", function(req, res) {
    const searchedTitle = req.params.title;
    const lowercaseSearchTitle = _.lowerCase(searchedTitle);
  
    Destination.find({ title: { $regex: `.*${searchedTitle}.*`, $options: 'i' } })
      .then((destinations) => {
        if (destinations.length > 0) {
          res.render("search", { searchResults: destinations, user: req.user, message : "" });
        } else {
          res.render("search", { searchResults: [], user: req.user, message : "Nothing Found" });
        }
      })
      .catch((err) => {
        console.error('Something went wrong', err);
        res.render("search", { searchResults: [], user: req.user });
      });
  });
  
  
 //Logic to render empty search of destination
 
 app.get("/search/", function(req,res){
  res.render("search", { searchResults: [], user: req.user, message : "Nothing Found" });
 });


  // POST route for form submission
  app.post("/search", function(req, res) {
    const searchQuery = req.body.searchTerm;
    res.redirect("/search/"+searchQuery);
  });


app.get("/newflight",function(req,res){
    res.render("newflight",{user : req.user});
});  


// Route for adding a new flight (admin only)
app.post("/newflight", isAuthenticated, function(req, res) {
    const flightID = req.body.flightID;
    const departure = req.body.departure;
    const arrival = req.body.arrival;
    const maxCapacity = req.body.maxCapacity;
    const departureDate = req.body.departureDate;
    const departureTime = req.body.departureTime;
    const arrivalDate = req.body.arrivalDate;
    const arrivalTime = req.body.arrivalTime;
    const availableSeats = req.body.availableSeats;
    const price = req.body.price;
  
    // Create a new flight object
    const newFlight = new Flight({
      flightID: flightID,
      departure: departure,
      arrival: arrival,
      maxCapacity: maxCapacity,
      price : price,
      schedule: [
        {
          departureDate: departureDate,
          departureTime: departureTime,
          arrivalDate: arrivalDate,
          arrivalTime: arrivalTime,
          availableSeats: availableSeats,
        },
      ],
    });
  
    // Save the new flight to the database
    newFlight.save()
      .then(() => {
        console.log("New flight added successfully");
        res.redirect("/allflights");
      })
      .catch((err) => {
        console.error("Error adding new flight:", err);
        res.redirect("/allflights");
      });
  });
    



app.get("/allflights/:flightID/edit", isAuthenticated, function(req, res) {
  const flightID = req.params.flightID;

  Flight.findOne({ _id: flightID })
    .exec()
    .then((foundFlight) => {
      if (foundFlight) {
        res.render("editflight", { foundFlight: foundFlight, user: req.user });
      } else {
        console.log("Flight not found");
        res.redirect("/");
      }
    })
    .catch((err) => {
      console.log(`Error Occurred: ${err}`);
      res.redirect("/");
    });
});

app.post("/allflights/:flightID/edit", isAuthenticated, function (req, res) {
    const flightID = req.params.flightID;
    const updatedDeparture = req.body.departure;
    const updatedArrival = req.body.arrival;
    const updatedMaxCapacity = req.body.maxCapacity; // Updated this line
    const updatedDepartureDate = req.body.departureDate;
    const updatedDepartureTime = req.body.departureTime;
    const updatedArrivalDate = req.body.arrivalDate;
    const updatedArrivalTime = req.body.arrivalTime;
    const updatedAvailableSeats = req.body.availableSeats;
    const updatedPrice = req.body.updatedPrice;
  
    const update = {
      departure: updatedDeparture,
      arrival: updatedArrival,
      maxCapacity: updatedMaxCapacity,
      price : updatedPrice,
      schedule: [
        {
      departureDate: updatedDepartureDate,
      departureTime : updatedDepartureTime,
      arrivalDate : updatedArrivalDate,
      arrivalTime :  updatedArrivalTime,
      availableSeats : parseInt(updatedAvailableSeats)
        },
    ]
    };
  
    Flight.findByIdAndUpdate(flightID, update, { new: true })
      .then((updatedFlight) => {
        if (updatedFlight) {
          res.redirect(`/allflights/${flightID}`);
        } else {
          console.log("Flight not found");
          res.redirect("/");
        }
      })
      .catch((err) => {
        console.log(`Error Occurred: ${err}`);
        res.redirect("/");
      });
  });


// Delete Post
app.post("/allflights/:flightID/delete", isAuthenticated, function(req, res) {
  const flightID = req.params.flightID;

  Flight.findByIdAndRemove(flightID)
    .then(() => {
      res.redirect("/");
    })
    .catch((err) => {
      console.log(`Error Occurred: ${err}`);
      res.redirect("/");
    });
});


// app.post("/allflights/search", async function(req, res) {
//   try {
//     const departure = req.body.departure;
//     const arrival = req.body.arrival;
//     const departureDate = req.body.departureDate;
//     const adults = parseInt(req.body.adults);
//     const children = parseInt(req.body.children);
//     const totalPassengers = adults + children;
//     const returnDate = req.body.returnDate;
//     const tripType = req.body.tripType;

//     var count = req.body.count;
//     var newDepartureArray = [];
//     var newArrivalArray = [];
//     var newDepartureDateArray = [];
//     var moreFlightsArray = [];
//     for (var i = 0; i < count; i++) {
//       const newDepartureDate = req.body[`newDepartureDate${i}`];
//       const newArrival = req.body[`newArrival${i}`];
//       const newDeparture = req.body[`newDeparture${i}`];

//       newDepartureArray.push(newDeparture);
//       newDepartureDateArray.push(newDepartureDate);
//       newArrivalArray.push(newArrival);
//     }

//     const firstFlight = await Flight.findOne({ departure: departure, arrival: arrival, departureDate: departureDate });

//     const moreFlightsPromises = [];
//     for (let i = 0; i < count; i++) {
//       const moreFlightPromise = Flight.findOne({ departure: newDepartureArray[i], arrival: newArrivalArray[i], departureDate: newDepartureDateArray[i] });
//       moreFlightsPromises.push(moreFlightPromise);
//     }

//     const moreFlights = await Promise.all(moreFlightsPromises);

//     const departureToArrivalFlights = await Flight.find({
//       departure: departure,
//       arrival: arrival,
//       "schedule.departureDate": departureDate,
//       "schedule.availableSeats": { $gte: totalPassengers }
//     });

//     const returnFlights = await Flight.find({
//       departure: arrival,
//       arrival: departure,
//       "schedule.departureDate": returnDate,
//       "schedule.availableSeats": { $gte: totalPassengers }
//     });

//     res.render("flightsearch", {
//       departureToArrivalFlights: departureToArrivalFlights,
//       returnFlights: returnFlights,
//       moreFlights: moreFlights,
//       user: req.user,
//       firstFlight: firstFlight
//     });
//   } catch (err) {
//     console.log(err);
//     res.redirect("/");
//   }
// });




app.post("/allflights/search", async function(req, res) {
  try {
    const departure = req.body.departure;
    const arrival = req.body.arrival;
    const departureDate = req.body.departureDate;
    const adults = parseInt(req.body.adults);
    const children = parseInt(req.body.children);
    const totalPassengers = adults + children;
    const returnDate = req.body.returnDate;

    const departureToArrivalFlights = await Flight.find({
      departure: departure,
      arrival: arrival,
      "schedule.departureDate": departureDate,
      "schedule.availableSeats": { $gte: totalPassengers }
    });

    const returnFlights = await Flight.find({
      departure: arrival,
      arrival: departure,
      "schedule.departureDate": returnDate,
      "schedule.availableSeats": { $gte: totalPassengers }
    });

    res.render("flightsearch", {
      departureToArrivalFlights: departureToArrivalFlights,
      returnFlights: returnFlights,
      user: req.user
    });
  } catch (err) {
    console.log(err);
    res.redirect("/");
  }
});





app.get("/alldestinations/:destinationId/edit", isAuthenticated, function(req, res) {
  const destinationID = req.params.destinationId;

  Destination.findOne({ _id: destinationID })
    .exec()
    .then((foundDestination) => {
      if (foundDestination) {
        res.render("edit", { foundDestination: foundDestination, user: req.user });
      } else {
        console.log("Destination not found");
        res.redirect("/");
      }
    })
    .catch((err) => {
      console.log(`Error Occurred: ${err}`);
      res.redirect("/");
    });
});

app.post("/alldestinations/:destinationId/edit", isAuthenticated, function (req, res) {
    const destinationID = req.params.destinationId;
    const updatedTitle = req.body.updatedTitle;
    const updatedFirstPara = req.body.updatedFirstPara;
    const updatedFirstImg = req.body.firstImg; // Updated this line
    const updatedContent = req.body.updatedContent;
    const imagesURL = req.body.imagesURL;
  
    const update = {
      title: updatedTitle,
      content: updatedContent,
      firstPara: updatedFirstPara,
      firstImg: updatedFirstImg, // Updated this line
    };
    if (imagesURL) {
      update.$addToSet = { imagesURL: imagesURL }; // Add the imageURL to the images array
    }
  
    Destination.findByIdAndUpdate(destinationID, update, { new: true })
      .then((updatedDestination) => {
        if (updatedDestination) {
          res.redirect(`/alldestinations/${destinationID}`);
        } else {
          console.log("Destination not found");
          res.redirect("/");
        }
      })
      .catch((err) => {
        console.log(`Error Occurred: ${err}`);
        res.redirect("/");
      });
  });


// Delete Post
app.post("/alldestinations/:destinationId/delete", isAuthenticated, function(req, res) {
  const destinationID = req.params.destinationId;

  Destination.findByIdAndRemove(destinationID)
    .then(() => {
      res.redirect("/alldestinations");
    })
    .catch((err) => {
      console.log(`Error Occurred: ${err}`);
      res.redirect("/alldestinations");
    });
});




// Remove Image from Post
// Remove Image from Post
app.post("/alldestinations/:destinationId/delete-image", isAuthenticated, function(req, res) {
    const destinationID = req.params.destinationId;
    const imagesURL = req.body.imagesURL;
  
    Destination.findByIdAndUpdate(
      destinationID,
      { $pull: { imagesURL: imagesURL } }, // Remove the imageURL from the images array
      { new: true }
    )
      .then((updatedDestination) => {
        if (updatedDestination) {
          res.redirect(`/alldestinations/${destinationID}/edit`);
        } else {
          console.log("Destination not found");
          res.redirect("/");
        }
      })
      .catch((err) => {
        console.log(`Error Occurred: ${err}`);
        res.redirect("/");
      });
  });


//Payment Route through Paypal


// Route for handling the successful PayPal payment

app.get("/allflights/:flightId/bookflight", isAuthenticated, async function(req, res) {
    try {
      const flightId = req.params.flightId;
      const flight = await Flight.findById(flightId);
  
      res.render("bookflight", { flightId: flightId, user: req.user, availableSeats: flight.schedule[0].availableSeats });
    } catch (err) {
      console.log(err);
      res.redirect("/allflights");
    }
});
  
app.post("/allflights/:flightId/bookflight", isAuthenticated, async function (req, res) {
  try {
    const flightId = req.params.flightId;
    const flight = await Flight.findById(flightId);

    if (flight.schedule[0].availableSeats > 0) {
      const booking = {
        flight: flight._id,
        departure: flight.departure,
        arrival: flight.arrival,
        departureDate: flight.schedule[0].departureDate,
        price : flight.price,
        name: req.body.Name,
        mobile: req.body.mobile,
        passportNumber: req.body.passportNumber,
        email: req.body.email,
      };

      // Store booking data in the session
      req.session.bookingData = booking;
      res.render("payment", { flightId: flightId, user: req.user, booking, flight : flight });
    } else {
      console.log("No available seats for the selected flight");
    }
  } catch (err) {
    console.log(err);
    res.redirect("/allflights");
  }
});


// Route for handling the payment method selection and initiating the PayPal payment
app.post("/allflights/:flightId/bookflight/paypal", isAuthenticated, async function (req, res) {
  try {
    const flightId = req.params.flightId;
    const paymentMethod = req.body.paymentMethod;

    // Fetch booking data from the session
    const booking = req.session.bookingData;
    if (!booking) {
      console.log("Booking data not found in the session");
      res.redirect(`/allflights/${flightId}`);
      return;
    }

    const flight = await Flight.findById(flightId);
    if (!flight) {
      console.log("Flight not found in the database");
      res.redirect(`/allflights/${flightId}`);
      return;
    }

    if (paymentMethod === "paypal") {
      // Implement the PayPal payment process
      // For this example, we will use the 'paypal-rest-sdk' package
      const paypal = require("paypal-rest-sdk");

      // Replace these with your PayPal credentials
      const clientId = process.env.PAYPAL_CLIENT_ID;
      const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
      console.log(clientId);
      console.log(clientSecret);

      paypal.configure({
        mode: "sandbox", // sandbox or live
        client_id: clientId,
        client_secret: clientSecret,
      });

      // Set up the payment details
      const createPaymentJson = {
        intent: "sale",
        payer: {
          payment_method: "paypal",
        },
        redirect_urls: {
          return_url: `https://hermiones-travel-agency.onrender.com/allflights/${flightId}/bookflight/paypal/success` || `http://localhost:3000/allflights/${flightId}/bookflight/paypal/success`,
          cancel_url: `https://hermiones-travel-agency.onrender.com/allflights/${flightId}/bookflight/paypal/success` || `http://localhost:3000/allflights/${flightId}/bookflight/paypal/cancel`,
        },
        transactions: [
          {
            item_list: {
              items: [
                {
                  name: "Flight Booking",
                  sku: "flight",
                  price: flight.price, // Replace with the actual price of the flight
                  currency: "USD",
                  quantity: 1,
                },
              ],
            },
            amount: {
              currency: "USD",
              total: flight.price, // Replace with the actual total price of the flight
            },
            description: "Flight booking payment",
          },
        ],
      };

      // Create the PayPal payment
      paypal.payment.create(createPaymentJson, function (error, payment) {
        if (error) {
          console.log("Error creating PayPal payment:", error);
          res.redirect(`/allflights/${flightId}`);
        } else {
          // Save the payment ID in the booking data for later use
          booking.paypalPaymentId = payment.id;
          req.session.bookingData = booking;

          // Redirect the user to PayPal for payment approval
          for (let i = 0; i < payment.links.length; i++) {
            if (payment.links[i].rel === "approval_url") {
              res.redirect(payment.links[i].href);
              break;
            }
          }
        }
      });
    } else {
      // Handle other payment methods here (credit/debit cards, UPI, Net Banking, etc.)
      // You will need to implement the corresponding payment gateway's logic here
      // and then redirect the user to the appropriate payment page
      console.log("No other payment method available");
      res.redirect("/allflights/:flightId/bookflight/failure");
    }
  } catch (err) {
    console.log(err);
    res.redirect("/allflights");
  }
});
  
//Payment Success route:


app.get("/allflights/:flightId/bookflight/paypal/cancel", function(req,res){
  const flightId = req.params.flightId;

  res.redirect(`/allflights/${flightID}`);
});



  
//Payment Success route:

app.get("/allflights/:flightId/bookflight/paypal/success", isAuthenticated, async function (req, res) {
  try {
    const flightId = req.params.flightId;
    const flight = await Flight.findById(flightId);
    const booking = req.session.bookingData;

    console.log("Payment was successful!");
    if (flight.schedule[0].availableSeats > 0) {
      const newbooking = {
        flight: flight._id,
        departure: flight.departure,
        arrival: flight.arrival,
        departureDate: flight.schedule[0].departureDate,
        name: booking.name,
        mobile: booking.mobile,
        passportNumber: booking.passportNumber,
        email: booking.email,
      };

      await User.findByIdAndUpdate(req.user._id, { $push: { bookedFlights: newbooking } });
      flight.schedule[0].availableSeats -= 1;
      await flight.save();

      console.log("Flight booked successfully");


      // Store the newbooking object in the session
      req.session.newbooking = newbooking;
      req.session.flight = flight;
      res.redirect("/ticket");

    } else {
      console.log("No available seats for the selected flight");
      res.redirect("/allflights");
    }
  } catch (err) {
    console.log(err);
    res.redirect("/allflights/" + req.params.flightId);
  }
});






// New ticket route
app.get("/ticket", isAuthenticated, function (req, res) {
  try {
    // Retrieve the newbooking and flight objects from the session
    const newbooking = req.session.newbooking;
    const flight = req.session.flight;
    console.log(newbooking.email);
    // Render the "ticket.ejs" template with the necessary data
    res.render("ticket", { user: req.user, newbooking: newbooking, flight: flight });

  } catch (err) {
    console.log(err);
    res.redirect("/");
  }
});


//Async Function Code :

async function sendTicketEmail(userEmail, ticketPath) {
  try {
    // Create a Nodemailer transporter with your email service provider settings
    const transporter = nodemailer.createTransport({
      host : process.env.SMTP_HOST,
      port : 587,
      secure : false,
      auth: {
        user: process.env.user, // Replace with your Gmail email
        pass: process.env.pass, // Replace with your Gmail password or an app password if enabled
      },
      tls : {
        ciphers : "SSLv3"
      }
    });

    // Read the ticket file from disk
    const ticketFile = fs.readFileSync(ticketPath);

    // Define the email options
    const mailOptions = {
      from: process.env.user, // Replace with your Gmail email
      to: userEmail, // Email address of the user
      subject: "Your Flight Ticket",
      text: "Please find your flight ticket attached.",
      attachments: [
        {
          filename: "ticket.pdf",
          content: ticketFile, // Attach the ticket file content
        },
      ],
    };

    // Send the email
    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent: " + info.response);
  } catch (error) {
    console.log("Error sending email:", error);
  }
}


app.get('/download-ticket', async (req, res) => {
  try {
    // Retrieve the newbooking object from the session
    const newbooking = req.session.newbooking;
    const flight = req.session.flight;

    if (!newbooking || !flight) {
      // If newbooking is not found in the session, return an error or redirect as per your requirement
      return res.status(400).send('Data not found in the session. Please book a flight first.');
    }

    const ticketTemplate = path.join(__dirname, 'views', 'ticket.ejs');

    // Render the "ticket.ejs" template with the necessary data
    const ticketHtml = await ejs.renderFile(ticketTemplate, { newbooking: newbooking, user: req.user, flight: flight });

    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setContent(ticketHtml);

    // Generate PDF from the ticket HTML
    const pdfBuffer = await page.pdf({ format: 'A4' });
    await browser.close();

    // Save the PDF ticket to a file
    const ticketPath = `ticket-for-${newbooking.departure}-${newbooking.arrival}.pdf`;
    fs.writeFileSync(ticketPath, pdfBuffer);

    // Set the response headers for downloading the file
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${path.basename(ticketPath)}`);
    res.send(pdfBuffer);

     // Set the ticketPath in the bookedFlight object
     newbooking.ticketPath = ticketPath;
     await User.findOneAndUpdate(
       { _id: req.user._id, "bookedFlights.flight": newbooking.flight },
       { $set: { "bookedFlights.$.ticketPath": ticketPath } }
     );
      console.log(newbooking.email);
    // Send the ticket to the user's email
    sendTicketEmail(newbooking.email, ticketPath);

  } catch (error) {
    console.error('Error generating ticket:', error);
    res.status(500).send('An error occurred while generating the ticket.');
  }
});


// Other required dependencies

// Add your existing route handlers and middleware here

// Route to generate the PDF
app.post('/generate-pdf', async (req, res) => {
  try {
    // Get the current EJS file content
    const ejsFileContent = fs.readFileSync('views/ticket.ejs', 'utf8');

    // Render the EJS file with any necessary data (if applicable)
    // Replace the variables below with the actual data you want to pass to the EJS file
    const htmlContent = ejs.render(ejsFileContent, { data: 'your_data_here' });

    // Generate a PDF from the HTML using Puppeteer
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf();
    await browser.close();

    // Set the response headers for PDF download
    res.setHeader('Content-Disposition', 'attachment; filename="webpage.pdf"');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', pdfBuffer.length);

    // Send the PDF buffer to the client
    res.send(pdfBuffer);
  } catch (err) {
    console.error('Error while generating or sending the PDF:', err);
    res.status(500).send('Error generating the PDF');
  }
});




  //Route for cancelling the booked flight.

app.post("/allflights/:flightId/cancelbooking/:bookingId", isAuthenticated, async function(req, res) {
  try {
    const flightId = req.params.flightId;
    const bookingId = req.params.bookingId;

    const flight = await Flight.findById(flightId);
    // Remove the booking from the user's bookedFlights array
    await User.findByIdAndUpdate(req.user._id, { $pull: { bookedFlights: { _id: bookingId } } });

    // Increase the available seats for the canceled flight

        flight.schedule[0].availableSeats += 1;
        await flight.save();


    console.log("Flight canceled successfully");
    
    res.redirect(`/allflights/${flightId}`);
  } catch (err) {
    console.log(err);
   
    res.redirect(`/allflights`);
  }
});

//Route for downloading ticket of flight

app.get("/allflights/:flightId/download-ticket/:bookingId", isAuthenticated, async function (req, res) {
  try {
    const flightId = req.params.flightId;
    const bookingId = req.params.bookingId;

    // Find the specific flight in the bookedFlights array using the bookingId
    const bookedFlight = req.user.bookedFlights.find((flight) => flight._id.toString() === bookingId);
    if (!bookedFlight) {
      console.log("Booking not found");
      res.redirect(`/allflights/${flightId}`);
      return;
    }

    // Retrieve the ticketPath from the booking data
    const ticketPath = bookedFlight.ticketPath;

    if (!ticketPath) {
      console.log("Ticket not found");
      res.redirect(`/allflights/${flightId}`);
      return;
    }

    // Trigger the download of the PDF ticket
    res.setHeader("Content-disposition", `attachment; filename=${ticketPath}`);
    res.setHeader("Content-type", "application/pdf");
    fs.createReadStream(ticketPath).pipe(res);

  } catch (err) {
    console.log(err);
    res.redirect(`/allflights`);
  }
});



// Hotels Route for rendering, editing and updating

app.get("/allhotels",function(req,res){
  Hotel.find({})
  .exec()
  .then((foundHotels)=>{
      res.render("allhotels",{hotels : foundHotels, user:req.user});
  })
  .catch((err)=>{
      console.log(err);
  });
});

app.get("/allhotels/:hotelId",function(req,res){
  const id= req.params.hotelId;

  Hotel.findById(id)
  .then((foundHotel)=>{
      res.render("hotel",{hotel : foundHotel, user:req.user});
  })
  .catch((err)=>{
      console.log(err);
  });
});



app.get("/newhotel",function(req,res){
  res.render("newhotel", {user:req.user});
});

app.post("/newhotel",function(req,res){
  const newHotelName = req.body.hotelName;
  const newHotelLocation = req.body.hotelLocation;
  const newHotelDescription = req.body.hotelDescription;
  const newHotelAmenities = req.body.hotelAmenities;
  const newHotelPricePerNight = req.body.pricePerNight;
  const newHotelRating = req.body.hotelRating;
  const newFirstImgLink = req.body.firstImg;
  const newFirstPara = req.body.firstPara;
  const newImageLink = req.body.imageLink;
  const newAvailableRooms = req.body.availableRooms;
  const newTotalRooms = req.body.totalRooms;

  const newHotel = new Hotel({
      name : newHotelName,
      location : newHotelLocation,
      description : newHotelDescription,
      firstImg : newFirstImgLink,
      firstPara : newFirstPara,
      amenities: newHotelAmenities,
      pricePerNight : newHotelPricePerNight,
      rating : newHotelRating,
      availableRooms : newAvailableRooms,
      totalRooms : newTotalRooms
  });
  
  if (newImageLink) {
      newHotel.images = [req.body.imageLink];
    }
  newHotel.save();
  res.redirect("/allhotels");
});

// GET route for searching
// GET route for searching
app.get("/allhotels/search/:location", function(req, res) {
  const searchedLocation = req.params.location;
  const lowercaseSearchTitle = _.lowerCase(searchedLocation);

  Hotel.find({ location: { $regex: `.*${searchedLocation}.*`, $options: 'i' } })
    .then((hotels) => {
      if (hotels.length > 0) {
        res.render("hotelsearch", { searchResults: hotels, user: req.user, message : "" });
      } else {
        res.render("hotelsearch", { searchResults: [], user: req.user, message : "Nothing Found" });
      }
    })
    .catch((err) => {
      console.error('Something went wrong', err);
      res.render("hotelsearch", { searchResults: [], user: req.user });
    });
});


//Logic to handle empty search for hotels 

app.get("/allhotels/search/", function(req,res){
  res.render("hotelsearch", { searchResults: [], user: req.user, message : "Nothing Found" });
});

// POST route for form submission
app.post("/allhotels/search", function(req, res) {
  const searchQuery = req.body.searchTerm;
  res.redirect("/allhotels/search/"+searchQuery);
});


//Routes for editing and deleting hotel by admin


app.get("/allhotels/:hotelId/edit", isAuthenticated, function(req, res) {
  const hotelID = req.params.hotelId;

  Hotel.findOne({ _id: hotelID })
    .exec()
    .then((foundHotel) => {
      if (foundHotel) {
        res.render("edithotel", { foundHotel: foundHotel, user: req.user });
      } else {
        console.log("Hotel not found");
        res.redirect("/");
      }
    })
    .catch((err) => {
      console.log(`Error Occurred: ${err}`);
      res.redirect("/");
    });
});

app.post("/allhotels/:hotelId/edit", isAuthenticated, function (req, res) {
  const hotelID = req.params.hotelId;
  const updatedName = req.body.updatedName;
  const updatedFirstPara = req.body.updatedFirstPara;
  const updatedFirstImg = req.body.updatedfirstImg; // Updated this line
  const updatedDescription = req.body.updatedDescription;
  const updatedLocation = req.body.updatedLocation;
  const updatedAmenities = req.body.updatedAmenities;
  const updatedPricePerNight = req.body.updatedPricePerNight;
  const updatedRating = req.body.updatedRating;
  const updatedAvailableRooms = req.body.updatedAvailableRooms;
  const updatedTotalRooms = req.body.updatedTotalRooms;
  const images = req.body.images;

  const update = {
    name: updatedName,
    description: updatedDescription,
    firstPara: updatedFirstPara,
    firstImg: updatedFirstImg, // Updated this line
    location : updatedLocation,
    pricePerNight : updatedPricePerNight,
    rating : updatedRating,
    availableRooms : updatedAvailableRooms,
    totalRooms : updatedTotalRooms
  };
  if (images) {
    update.$addToSet = { images: images }; // Add the images to the images array
  }
  if (updatedAmenities) {
    update.$addToSet = { amenities: updatedAmenities };
  }

  Hotel.findByIdAndUpdate(hotelID, update, { new: true })
    .then((updatedHotel) => {
      if (updatedHotel) {
        res.redirect(`/allhotels/${hotelID}`);
      } else {
        console.log("Hotel not found");
        res.redirect("/");
      }
    })
    .catch((err) => {
      console.log(`Error Occurred: ${err}`);
      res.redirect("/");
    });
});


// Delete Post
app.post("/allhotels/:hotelId/delete", isAuthenticated, function(req, res) {
const hotelID = req.params.hotelId;

Hotel.findByIdAndRemove(hotelID)
  .then(() => {
    res.redirect("/allhotels");
  })
  .catch((err) => {
    console.log(`Error Occurred: ${err}`);
    res.redirect("/allhotels");
  });
});




// Remove Image from Post
// Remove Image from Post
app.post("/allhotels/:hotelId/delete-image", isAuthenticated, function(req, res) {
  const hotelID = req.params.hotelId;
  const images = req.body.images;

  Hotel.findByIdAndUpdate(
    hotelID,
    { $pull: { images: images} }, // Remove the imageURL from the images array
    { new: true }
  )
    .then((updatedHotel) => {
      if (updatedHotel) {
        res.redirect(`/allhotels/${hotelID}/edit`);
      } else {
        console.log("Hotel not found");
        res.redirect("/");
      }
    })
    .catch((err) => {
      console.log(`Error Occurred: ${err}`);
      res.redirect("/");
    });
});

app.post("/allhotels/:hotelId/delete-amenity", isAuthenticated, async function(req, res) {
  try {
    const hotelID = req.params.hotelId;
    const amenityToDelete = req.body.amenity;

    // Delete the amenity from the hotel's amenities array
    await Hotel.findByIdAndUpdate(hotelID, { $pull: { amenities: amenityToDelete } });

    res.redirect(`/allhotels/${hotelID}/edit`);
  } catch (err) {
    console.log(err);
    res.redirect("/");
  }
});


//Routes for hotel booking

app.get("/allhotels/:hotelId/bookhotel", isAuthenticated, async function(req, res) {
  try {
    const hotelId = req.params.hotelId;
    const hotel = await Hotel.findById(hotelId);

    res.render("bookhotel", { hotelId: hotelId, user: req.user, availableRooms: hotel.availableRooms });
  } catch (err) {
    console.log(err);
    res.redirect("/allhotels");
  }
});


app.post("/allhotels/:hotelId/bookhotel", isAuthenticated, async function(req, res) {
  try {
    const hotelId = req.params.hotelId;
    const { Name, mobile, checkInDate, checkOutDate, numberOfMembers, numberOfRooms, email } = req.body;
    const hotel = await Hotel.findById(hotelId);

    if (hotel.availableRooms > 0) {
      const booking = {
        customerName: Name,
        mobile : mobile,
        email : email,
        numberOfMembers : numberOfMembers,
        occupiedRooms : numberOfRooms,
        checkInDate : checkInDate,
        checkOutDate : checkOutDate,
        hotel: hotel._id,
        hotelName : hotel.name,
        location: hotel.location,
        rating: hotel.rating,
        pricePerNight: hotel.pricePerNight,
        availableRooms: hotel.availableRooms,
        amenities: hotel.amenities.join(", ")
      };


      req.session.bookingHotel = booking;
      res.render("payment_hotel",{hotelId: hotelId, user: req.user, booking, availableRooms: hotel.availableRooms});

    } else {
      console.log("No available rooms for the selected hotel");
    }
  } catch (err) {
    console.log(err);
    res.redirect("/allhotels/" + req.params.hotelId);
  }
});


//Route for handling payment through Paypal

app.post("/allhotels/:hotelId/bookhotel/paypal", isAuthenticated, async function (req, res) {
  try {
    const hotelId = req.params.hotelId;
    const paymentMethod = req.body.paymentMethod;

    // Fetch booking data from the session
    const booking = req.session.bookingHotel;
    if (!booking) {
      console.log("Booking data not found in the session");
      res.redirect(`/allhotels/${hotelId}`);
      return;
    }

    // Fetch hotel details from the database using the hotelId
    const hotel = await Hotel.findById(hotelId);
    if (!hotel) {
      console.log("Hotel not found in the database");
      res.redirect(`/allhotels/${hotelId}`);
      return;
    }

    if (paymentMethod === "paypal") {
      // Implement the PayPal payment process
      // For this example, we will use the 'paypal-rest-sdk' package
      const paypal = require("paypal-rest-sdk");

      // Replace these with your PayPal credentials
      const clientId = process.env.PAYPAL_CLIENT_ID;
      const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
      console.log(clientId);
      console.log(clientSecret);

      paypal.configure({
        mode: "sandbox", // sandbox or live
        client_id: clientId,
        client_secret: clientSecret,
      });

      // Calculate the total amount for the booking based on hotel pricePerNight and number of occupiedRooms
      const totalAmount = (parseFloat(hotel.pricePerNight) * parseInt(booking.occupiedRooms)).toFixed(2);

      // Set up the payment details
      const createPaymentJson = {
        intent: "sale",
        payer: {
          payment_method: "paypal",
        },
        redirect_urls: {
          return_url: `http://localhost:3000/allhotels/${hotelId}/bookhotel/paypal/success`,
          cancel_url: `http://localhost:3000/allhotels/${hotelId}/bookhotel/paypal/cancel`,
        },
        transactions: [
          {
            item_list: {
              items: [
                {
                  name: "Hotel Booking",
                  sku: "hotel",
                  price: totalAmount, // Replace with the actual price of the flight
                  currency: "USD",
                  quantity: 1,
                },
              ],
            },
            amount: {
              currency: "USD",
              total: totalAmount, // Replace with the actual total price of the flight
            },
            description: "Hotel booking payment",
          },
        ],
      };

      // Create the PayPal payment
      paypal.payment.create(createPaymentJson, function (error, payment) {
        if (error) {
          console.log("Error creating PayPal payment for hotel:", error);
          res.redirect(`/allhotels/${hotelId}`);
        } else {
          // Save the payment ID in the booking data for later use
          booking.paypalPaymentId = payment.id;
          req.session.bookingHotel = booking;

          // Redirect the user to PayPal for payment approval
          for (let i = 0; i < payment.links.length; i++) {
            if (payment.links[i].rel === "approval_url") {
              res.redirect(payment.links[i].href);
              break;
            }
          }
        }
      });
    } else {
      // Handle other payment methods here (credit/debit cards, UPI, Net Banking, etc.)
      // You will need to implement the corresponding payment gateway's logic here
      // and then redirect the user to the appropriate payment page
      console.log("No other payment method available");
      res.redirect("/allhotels/:hotelId/bookhotel/failure");
    }
  } catch (err) {
    console.log(err);
    res.redirect("/allhotels");
  }
});


app.get("/allhotels/:hotelId/bookhotel/paypal/success", isAuthenticated, async function(req,res){

  const hotelId = req.params.hotelId;
  const hotel = await Hotel.findById(hotelId);
  const booking = req.session.bookingHotel;

  if(hotel.availableRooms > 0){

    const newbooking = {
      customerName: booking.customerName,
      mobile : booking.mobile,
      email : booking.email,
      numberOfMembers : booking.numberOfMembers,
      occupiedRooms : booking.occupiedRooms,
      checkInDate : booking.checkInDate,
      checkOutDate : booking.checkOutDate,
      hotel: hotel._id,
      hotelName : hotel.name,
      location: hotel.location,
      rating: hotel.rating,
      pricePerNight: hotel.pricePerNight,
      availableRooms: hotel.availableRooms,
      amenities: hotel.amenities.join(", ")
    };

    var totalAmount = parseInt(newbooking.occupiedRooms)*parseInt(hotel.pricePerNight);

    await User.findByIdAndUpdate(req.user._id, { $push: { bookedHotels: newbooking } });
        console.log(booking.occupiedRooms);
        hotel.availableRooms -= booking.occupiedRooms;
        await hotel.save();
  
        console.log("Hotel booked successfully");

      req.session.bookingHotel = null;
      req.session.newbookinghotel = newbooking;
      req.session.hotel = hotel;
      req.session.totalAmount = totalAmount;
      res.redirect(`/ticket/hotel`);
  }
  else{
    console.log("No available rooms for the selected hotel");
    res.redirect("/allhotels");
  }
});

// New ticket route
app.get("/ticket/hotel", isAuthenticated, function (req, res) {
  try {
    // Retrieve the newbooking and flight objects from the session
    const newbooking = req.session.newbookinghotel;
    const hotel = req.session.hotel;
    const totalAmount = req.session.totalAmount;
    console.log(newbooking.email);
    // Render the "ticket.ejs" template with the necessary data
    res.render("ticket_hotel", { user: req.user, newbooking: newbooking, hotel: hotel, totalAmount : totalAmount });

  } catch (err) {
    console.log(err);
    res.redirect("/");
  }
});


//Async Function Code :

async function sendHotelEmail(userEmail, ticketPath) {
  try {
    // Create a Nodemailer transporter with your email service provider settings
    const transporter = nodemailer.createTransport({
      host : process.env.SMTP_HOST,
      port : 587,
      secure : false,
      auth: {
        user: process.env.user, // Replace with your Gmail email
        pass: process.env.pass, // Replace with your Gmail password or an app password if enabled
      },
      tls : {
        ciphers : "SSLv3"
      }
    });

    // Read the ticket file from disk
    const ticketFile = fs.readFileSync(ticketPath);

    // Define the email options
    const mailOptions = {
      from: process.env.user, // Replace with your Gmail email
      to: userEmail, // Email address of the user
      subject: "Your Hotel Invoice",
      text: "Please find your hotel invoice attached.",
      attachments: [
        {
          filename: "ticket_hotel.pdf",
          content: ticketFile, // Attach the ticket file content
        },
      ],
    };

    // Send the email
    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent: " + info.response);
  } catch (error) {
    console.log("Error sending email:", error);
  }
}


app.get('/download-ticket/hotel', async (req, res) => {
  try {
    // Retrieve the newbooking object from the session
    const newbooking = req.session.newbookinghotel;
    const hotel = req.session.hotel;
    var totalAmount = req.session.totalAmount;

    if (!newbooking || !hotel) {
      // If newbooking is not found in the session, return an error or redirect as per your requirement
      return res.status(400).send('Data not found in the session. Please book a flight first.');
    }

    const ticketTemplate = path.join(__dirname, 'views', 'ticket_hotel.ejs');

    // Render the "ticket.ejs" template with the necessary data
    const ticketHtml = await ejs.renderFile(ticketTemplate, { newbooking: newbooking, user: req.user, hotel: hotel, totalAmount : totalAmount });

    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setContent(ticketHtml);

    // Generate PDF from the ticket HTML
    const pdfBuffer = await page.pdf({ format: 'A4' });
    await browser.close();

    // Save the PDF ticket to a file
    const ticketPath = `hotel booking for ${newbooking.customerName}`;
    fs.writeFileSync(ticketPath, pdfBuffer);

    // Set the response headers for downloading the file
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${path.basename(ticketPath)}`);
    res.send(pdfBuffer);

      // Set the ticketPath in the bookedFlight object
      newbooking.ticketPath = ticketPath;
      await User.findOneAndUpdate(
        { _id: req.user._id, "bookedHotels.hotel": newbooking.hotel },
        { $set: { "bookedHotels.$.ticketPath": ticketPath } }
      );
      console.log(newbooking.email);
    // Send the ticket to the user's email
    sendHotelEmail(newbooking.email, ticketPath);
    totalAmount = 0;
  } catch (error) {
    console.error('Error generating ticket:', error);
    res.status(500).send('An error occurred while generating the ticket.');
  }
});


app.get("allhotels/:hotelId/bookhotel/paypal/failure", isAuthenticated, function(req,res){
  const hotelId = req.params.hotelId;
  console.log("Error to confirm payment for booking hotel");
  res.redirect(`/allhotels/${hotelId}`);
});

//Route for cancelling the booked flight.

app.post("/allhotels/:hotelId/cancelbooking/:bookingId", isAuthenticated, async function(req, res) {
  try {
    const hotelId = req.params.hotelId;
    const bookingId = req.params.bookingId;

    const hotel = await Hotel.findById(hotelId);
    // Remove the booking from the user's bookedHotels array
    await User.findByIdAndUpdate(req.user._id, { $pull: { bookedHotels: { _id: bookingId } } });

    // Find the specific hotel in the bookedHotels array using hotelId
    const bookedHotel = req.user.bookedHotels.find((hotel) => hotel._id.toString() === bookingId);
    if (bookedHotel) {
      const usedRooms = bookedHotel.occupiedRooms;
      // Increase the available rooms for the canceled hotel booking
      hotel.availableRooms += parseInt(usedRooms, 10);
      await hotel.save();

      console.log("Hotel Booking canceled successfully");
    } else {
      console.log("Hotel Booking not found in user's bookings.");
    }

    res.redirect(`/allhotels/${hotelId}`);
  } catch (err) {
    console.log(err);
    res.redirect(`/allhotels`);
  }
});

app.get("/allhotels/:hotelId/download-ticket/:bookingId", isAuthenticated, async function (req, res) {
  try {
    const hotelId = req.params.hotelId;
    const bookingId = req.params.bookingId;

    // Find the specific hotel in the bookedHotels array using the bookingId
    const bookedHotel = req.user.bookedHotels.find((hotel) => hotel._id.toString() === bookingId);
    if (!bookedHotel) {
      console.log("Booking not found");
      res.redirect(`/allhotels/${hotelId}`);
      return;
    }

    // Retrieve the ticketPath from the booking data
    const ticketPath = bookedHotel.ticketPath;

    if (!ticketPath) {
      console.log("Ticket not found");
      res.redirect(`/allhotels/${hotelId}`);
      return;
    }

    // Trigger the download of the PDF ticket
    res.setHeader("Content-disposition", `attachment; filename=${ticketPath}`);
    res.setHeader("Content-type", "application/pdf");
    fs.createReadStream(ticketPath).pipe(res);

  } catch (err) {
    console.log(err);
    res.redirect(`/allhotels`);
  }
});

app.get("/userprofile", isAuthenticated, async function (req, res) {
  try {
    const destinations = await Destination.find({}).exec();
    const hotels = await Hotel.find({}).exec();
    const user = req.user;
    res.render("user_profile", { user: user, destinations : destinations, hotels : hotels });
  } catch (err) {
    console.log(err);
    res.status(500).send("Internal Server Error");
  }
});


app.get("/about", function(req, res) {
    res.render("about", {user:req.user});
});

app.get("/services", function(req, res) {
    res.render("services",{user:req.user});
});

app.get("/contact",function(req,res){
    res.render("contact", {user:req.user});
});

app.post("/contact", function(req, res) {
  const title = req.body.title;
  const content = req.body.content;
  const email = req.body.email;
  const password = req.body.password;

  // Create a Nodemailer transporter
  const transporter = nodemailer.createTransport({
    service: "Gmail",
    auth: {
      user: email, // Use the provided email as the 'from' address
      pass: password // Replace with your email password
    }
  });

  // Compose the email message
  const mailOptions = {
    from: email, // Use the provided email as the 'from' address
    to: process.env.EMAIL, // Replace with your email address
    subject: `Title: ${title}`,
    text: `Content: ${content}`
  };

  // Send the email
  transporter.sendMail(mailOptions, function(error, info) {
    if (error) {
      console.log(error);
      res.redirect("/contact"); // Handle error
    } else {
      console.log("Email sent: " + info.response);
      res.redirect("/"); // Redirect to homepage after successful submission
    }
  });
});

async function sendSubscribeEmail(userEmail) {
  try {
    // Create a Nodemailer transporter with your email service provider settings
    const transporter = nodemailer.createTransport({
      host : process.env.SMTP_HOST,
      port : 587,
      secure : false,
      auth: {
        user: process.env.user, // Replace with your Gmail email
        pass: process.env.pass, // Replace with your Gmail password or an app password if enabled
      },
      tls : {
        ciphers : "SSLv3"
      }
    });


    // Define the email options
    const mailOptions = {
      from: process.env.user, // Replace with your Gmail email
      to: userEmail, // Email address of the user
      subject: "News Letter Subscription",
      text: "Congratulations..! You have successfully subscribed to our News Letter. We are excited to share the latest thrilling news with you and keep you updated. Thanks for subscribing our new letter.",

    };

    // Send the email
    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent: " + info.response);
  } catch (error) {
    console.log("Error sending email:", error);
  }
}


app.post("/newsletter", isAuthenticated, function(req,res){
  var email = req.body.email;
  User.findByIdAndUpdate(req.user._id, { subscribed: 'true', subscribedemail : email }) // Update 'subscribed' to 'true'
  .then((user) => {
    console.log("Successfully subscribed to the newsletter");
  })
  .catch((err) => {
    console.log("Error: " + err);
  });
  sendSubscribeEmail(email);
  res.redirect("/");
});

async function sendUnsubscribeEmail(userEmail) {
  try {
    // Create a Nodemailer transporter with your email service provider settings
    const transporter = nodemailer.createTransport({
      host : process.env.SMTP_HOST,
      port : 587,
      secure : false,
      auth: {
        user: process.env.user, // Replace with your Gmail email
        pass: process.env.pass, // Replace with your Gmail password or an app password if enabled
      },
      tls : {
        ciphers : "SSLv3"
      }
    });


    // Define the email options
    const mailOptions = {
      from: process.env.user, // Replace with your Gmail email
      to: userEmail, // Email address of the user
      subject: "Unscribe Hermione's News letter",
      text: "You have successfully unsubscribed from the Hermione's News Letter. If you have any specific problems with our service please try contacting us at hermionemagicalescapes@gmail.com so that we can resolve your issue and improve our service. Thank You!",

    };

    // Send the email
    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent: " + info.response);
  } catch (error) {
    console.log("Error sending email:", error);
  }
}


app.post("/newsletter/unsubscribe", isAuthenticated, function(req,res){
  const email = req.user.subscribedemail;
  User.findByIdAndUpdate(req.user._id, { subscribed: 'false', subscribedemail : "" }) // Update 'subscribed' to 'true'
  .then((user) => {
    console.log("You have successfully Unsubscribed to our newsletter");
  })
  .catch((err) => {
    console.log("Error: " + err);
  });
  sendUnsubscribeEmail(email);
  res.redirect("/");
});

const port = process.env.PORT || 3000;

app.listen(port, "0.0.0.0", function () {
  console.log("Server started on port 3000");
});


