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
    const vipAccounts = JSON.parse(process.env.VIP_ACCOUNTS || "[]");

    if (!adminUser || !adminPass || !jwtSecret) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          success: false,
          message: "Server configuration error"
        })
      };
    }

    // ==========================
    // LOGIN ADMIN
    // ==========================
    if (
      username === adminUser &&
      password === adminPass
    ) {

      const token = jwt.sign(
        {
          role: "admin"
        },
        jwtSecret,
        {
          expiresIn: "30m"
        }
      );

      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          role: "admin",
          token
        })
      };

    }

    // ==========================
    // LOGIN VIP
    // ==========================
    const vip = vipAccounts.find(item =>
      item.username === username &&
      item.password === password
    );

    if (vip) {

      const token = jwt.sign(
        {
          role: "vip",
          username: vip.username,
          folder: vip.folder,
          nama: vip.nama
        },
        jwtSecret,
        {
          expiresIn: "30m"
        }
      );

      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          role: "vip",
          nama: vip.nama,
          folder: vip.folder,
          token
        })
      };

    }

    // ==========================
    // LOGIN GAGAL
    // ==========================
    return {
      statusCode: 401,
      body: JSON.stringify({
        success: false,
        message: "Username atau password salah"
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