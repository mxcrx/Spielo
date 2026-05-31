const jwt = require("jsonwebtoken");
const config = require("../config");

const SECRET = config.jwtSecret;

function createToken(user) {
  return jwt.sign(
    {
      userId: user.id.toString(),
      username: user.username,
      role: user.role,
    },
    SECRET,
    { expiresIn: "7d" },
  );
}

function verifyToken(token) {
  try {
    return jwt.verify(token, SECRET);
  } catch (err) {
    return null;
  }
}

module.exports = {
  createToken,
  verifyToken,
};
