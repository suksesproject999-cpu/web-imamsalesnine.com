const jwt = require("jsonwebtoken");

exports.handler = async (event) => {

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({
        success: false,
        message: "Method Not Allowed"
      })
    };
  }

  try {

    const { username, password } = JSON.parse(event.body);

    const adminUser = process.env.ADMIN_USER;
    const adminPass = process.env.ADMIN_PASS;
    const jwtSecret = process.env.JWT_SECRET;

    if (!adminUser || !adminPass || !jwtSecret) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          success: false,
          message: "Server configuration error"
        })
      };
    }

    if (username !== adminUser || password !== adminPass) {

      return {
        statusCode: 401,
        body: JSON.stringify({
          success: false,
          message: "Username atau password salah"
        })
      };

    }

    const token = jwt.sign(

      {
        role: "admin"
      },

      jwtSecret,

      {
        expiresIn: "24h"
      }

    );

    return {

      statusCode: 200,

      body: JSON.stringify({

        success: true,

        role: "admin",

        token,
        
        debug:{

            issued_at:new Date().toISOString(),

            expires_in:"24h"

        }

      })

    };

  } catch (err) {

    return {

      statusCode: 500,

      body: JSON.stringify({

        success: false,

        message: "Internal Server Error"

      })

    };

  }

};