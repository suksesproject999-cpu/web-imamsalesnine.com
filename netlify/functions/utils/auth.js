const jwt = require("jsonwebtoken");

function verifyToken(event) {

    const authHeader =
        event.headers.authorization ||
        event.headers.Authorization;

    if (!authHeader) {
        throw new Error("TOKEN_NOT_FOUND");
    }

    const token = authHeader.replace("Bearer ", "");

    return jwt.verify(
        token,
        process.env.JWT_SECRET
    );

}

module.exports = {
    verifyToken
};