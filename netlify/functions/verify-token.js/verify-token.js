const { verifyToken } = require("./auth");

exports.handler = async (event) => {

    if (event.httpMethod !== "GET") {
        return {
            statusCode: 405,
            body: JSON.stringify({
                success: false,
                message: "Method Not Allowed"
            })
        };
    }

    try {

        const user = verifyToken(event);

        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                user
            })
        };

    } catch {

        return {
            statusCode: 401,
            body: JSON.stringify({
                success: false,
                message: "Token tidak valid atau sudah expired"
            })
        };

    }

};