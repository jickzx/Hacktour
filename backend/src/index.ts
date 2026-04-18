/**
 * Hacktour backend entry point
 * Express server with health check, edit API, and GLM 5.1 integration
 */
import "dotenv/config";
import express from "express";
import cors from "cors";
import editRouter from "./routes/edit";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api", editRouter);

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
