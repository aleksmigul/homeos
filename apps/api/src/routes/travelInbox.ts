import { Router } from "express";
import { config } from "../config.js";
import { listTravelEmails } from "../travelEmailRepository.js";

export const travelInboxRouter = Router();

travelInboxRouter.get("/travel-inbox", (_req, res) => {
  res.json({ address: config.travelInboxAddress, configured: Boolean(config.resendApiKey && config.resendWebhookSecret), emails: listTravelEmails() });
});
