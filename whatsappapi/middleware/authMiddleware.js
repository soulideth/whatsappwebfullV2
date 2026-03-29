const jwt = require("jsonwebtoken");
const config = require("../config.json");

const authMiddleware = (req, res, next) => {
  const token = req.header("Authorization")?.replace("Bearer ", "");

  if (!token) {
    return res.status(401).json({ status: "error", message: "No token, authorization denied" });
  }

  try {
    const decoded = jwt.verify(token, config.jwt_secret || "secret");
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ status: "error", message: "Token is not valid" });
  }
};

module.exports = authMiddleware;
