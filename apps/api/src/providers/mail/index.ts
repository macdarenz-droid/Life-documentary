// Mail goes through this port. The real vendor is chosen with the owner (DECISIONS D36); until then the
// Worker and its tests use the recording sender, which keeps messages in memory and never prints them.
export type MailMessage = { to: string; subject: string; text: string };

export type MailSender = { send(to: string, subject: string, text: string): Promise<void> };

export type RecordingMail = MailSender & {
  /** The messages sent so far, oldest first (at most the last 50). */
  readonly sent: readonly MailMessage[];
};

const KEEP = 50;

export function recordingMail(): RecordingMail {
  const sent: MailMessage[] = [];
  return {
    sent,
    send(to, subject, text) {
      sent.push({ to, subject, text });
      if (sent.length > KEEP) sent.splice(0, sent.length - KEEP);
      return Promise.resolve();
    },
  };
}
