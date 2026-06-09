/**
 * Gmail transport.
 *
 * PLACEHOLDER until the Replit Gmail integration is connected. Once the user
 * completes the Gmail OAuth, this file is replaced with the generated connector
 * client (`getUncachableGmailClient`) and a real `messages.send` call. Until
 * then it throws, and `email.ts#sendEmail` catches it so signup, subscriptions,
 * and support reports never break when email is not yet configured.
 */
export interface GmailMessage {
  to: string;
  from: string;
  replyTo?: string;
  subject: string;
  html: string;
}

export async function sendGmailMessage(_message: GmailMessage): Promise<void> {
  throw new Error("Gmail integration not connected yet");
}
