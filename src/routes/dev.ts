import { Router } from "express";
import { simulatedEmails } from "./auth.js";

const router = Router();

router.get("/last-emails", async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) {
      return res.json([]);
    }
    const filtered = simulatedEmails.filter(
      (m) => m.to.toLowerCase() === String(email).toLowerCase()
    );
    res.json(filtered);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/last-emails/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const index = simulatedEmails.findIndex((m) => m.id === id);
    if (index !== -1) {
      simulatedEmails.splice(index, 1);
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
