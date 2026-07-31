import express from "express";

const app = express();

const PORT = 8000;

app.use(express.json());

app.get("/", (req, res) => {
  res.send("Hello from the server!");
});

app.listen(PORT, () => {
  console.log(`the server is running on http://localhost:${PORT}`);
});
