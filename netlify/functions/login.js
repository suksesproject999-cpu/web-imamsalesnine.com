exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: "Method Not Allowed"
    };
  }

  const { username, password } = JSON.parse(event.body);

  const adminUser = process.env.ADMIN_USER;
  const adminPass = process.env.ADMIN_PASS;

  if (username === adminUser && password === adminPass) {
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        role: "admin"
      })
    };
  }

  return {
    statusCode: 401,
    body: JSON.stringify({
      success: false,
      message: "Username atau password salah"
    })
  };
};