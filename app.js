const express = require("express");
const app = express();
app.use(express.json());

const sqlite3 = require("sqlite3");
const { open } = require("sqlite");

const path = require("path");
const db_path = path.join(__dirname, "covid19IndiaPortal.db");

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

let db = null;

const initializeDbAndServer = async () => {
  db = await open({ filename: db_path, driver: sqlite3.Database });
  app.listen(3000, () => {
    try {
      console.log("server running at http://localhost:3000");
    } catch (error) {
      console.log(`DB ERROR ${error.message}`);
      process.exit(1);
    }
  });
};
initializeDbAndServer();

const userValidation = async (request, response, next) => {
  const { username, password } = request.body;
  const getUserDetails = `
  SELECT 
    *
  FROM
    user
  WHERE 
    username='${username}';`;
  const userDetails = await db.get(getUserDetails);
  if (userDetails !== undefined) {
    const isPasswordMatch = await bcrypt.compare(
      password,
      userDetails.password
    );
    if (isPasswordMatch === true) {
      const payload = { username: username };
      const jwtToken = await jwt.sign(payload, "SECRET_KEY");
      response.send({ jwtToken: jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  } else {
    response.status(400);
    response.send("Invalid user");
  }
};

const userAuthentication = async (request, response, next) => {
  const authHeader = request.headers["authorization"];
  if (authHeader === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    const jwtToken = authHeader.split(" ")[1];
    await jwt.verify(jwtToken, "SECRET_KEY", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

const convertDbObjectToCamelCaseStateObject = (object) => {
  return {
    stateId: object.state_id,
    stateName: object.state_name,
    population: object.population,
  };
};

const convertDbObjectToCamelCaseDisrtictObject = (object) => {
  return {
    districtId: object.district_id,
    districtName: object.district_name,
    stateId: object.state_id,
    cases: object.cases,
    cured: object.cured,
    active: object.active,
    deaths: object.deaths,
  };
};

//API 1 POST user login
app.post("/login/", userValidation, async (request, response) => {});

//API 2 GET
app.get("/states/", userAuthentication, async (request, response) => {
  try {
    const getStatesQuery = `
    SELECT 
        *
    FROM 
        state;`;
    const dbResponse = await db.all(getStatesQuery);
    results = [];
    for (let i = 0; i < dbResponse.length; i++) {
      let resObject = convertDbObjectToCamelCaseStateObject(dbResponse[i]);
      results.push(resObject);
    }
    response.send(results);
  } catch (error) {
    console.log(`ERROR ${error.message}`);
  }
});

//API 3 GET
app.get("/states/:stateId/", userAuthentication, async (request, response) => {
  try {
    const { stateId } = request.params;
    const getStateQuery = `
    SELECT 
        *
    FROM 
        state
    WHERE 
        state_id='${stateId}';`;
    const dbResponse = await db.all(getStateQuery);
    results = [];
    for (let i = 0; i < dbResponse.length; i++) {
      let resObject = convertDbObjectToCamelCaseStateObject(dbResponse[i]);
      results.push(resObject);
    }
    response.send(results[0]);
  } catch (error) {
    console.log(`ERROR ${error.message}`);
  }
});

//API 4 POST
app.post("/districts/", userAuthentication, async (request, response) => {
  try {
    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = request.body;
    const postReportQuery = `
        INSERT INTO
            district (district_name,state_id,cases,cured,active,deaths)
        VALUES
            (
                '${districtName}',
                ${stateId},
                ${cases},
                ${cured},
                ${active},
                ${deaths}
            );`;
    await db.run(postReportQuery);
    response.send("District Successfully Added");
  } catch (error) {
    console.log(`ERROR ${error.message}`);
  }
});

//API 5 GET
app.get(
  "/districts/:districtId/",
  userAuthentication,
  async (request, response) => {
    try {
      const { districtId } = request.params;
      const getDistrictQuery = `
    SELECT 
        *
    FROM 
        district
    WHERE 
        district_id='${districtId}';`;
      const dbResponse = await db.all(getDistrictQuery);
      results = [];
      for (let i = 0; i < dbResponse.length; i++) {
        let resObject = convertDbObjectToCamelCaseDisrtictObject(dbResponse[i]);
        results.push(resObject);
      }
      response.send(results[0]);
    } catch (error) {
      console.log(`ERROR ${error.message}`);
    }
  }
);

//API 6 DELETE
app.delete(
  "/districts/:districtId/",
  userAuthentication,
  async (request, response) => {
    try {
      const { districtId } = request.params;
      const removeQuery = `
    DELETE 
    FROM
        district
    WHERE
        district_id='${districtId}';`;
      const dbResponse = await db.run(removeQuery);
      response.send("District Removed");
    } catch (error) {
      console.log(`ERROR ${error.message}`);
    }
  }
);

//API 7 PUT
app.put(
  "/districts/:districtId/",
  userAuthentication,
  async (request, response) => {
    try {
      const { districtId } = request.params;
      const {
        districtName,
        stateId,
        cases,
        cured,
        active,
        deaths,
      } = request.body;
      const updateQuery = `
        UPDATE
            district
        SET
            district_name= '${districtName}',
            state_id=${stateId},
            cases=${cases},
            cured=${cured},
            active=${active},
            deaths=${deaths}
        WHERE
            district_id='${districtId}';`;
      const dbResponse = await db.run(updateQuery);
      response.send("District Details Updated");
    } catch (error) {
      console.log(`ERROR ${error.message}`);
    }
  }
);

//API 8 GET
app.get(
  "/states/:stateId/stats/",
  userAuthentication,
  async (request, response) => {
    try {
      const { stateId } = request.params;
      const Query = `
        SELECT
            *
        FROM
            district
        WHERE
            state_id = ${stateId};`;
      const dbResponse = await db.all(Query);
      let totalCases = 0;
      let totalCured = 0;
      let totalActive = 0;
      let totalDeaths = 0;

      for (let i = 0; i < dbResponse.length; i++) {
        let resObject = convertDbObjectToCamelCaseDisrtictObject(dbResponse[i]);
        totalCases += resObject.cases;
        totalCured += resObject.cured;
        totalActive += resObject.active;
        totalDeaths += resObject.deaths;
      }
      response.send({
        totalCases: totalCases,
        totalCured: totalCured,
        totalActive: totalActive,
        totalDeaths: totalDeaths,
      });
    } catch (error) {
      console.log(`ERROR API ${error.message}`);
    }
  }
);

module.exports = app;
