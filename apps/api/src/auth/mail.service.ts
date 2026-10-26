import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Sends account emails through Resend when RESEND_API_KEY is set.
 * Without a key (local development) the email, including its link, is written to the API log.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly apiKey?: string;
  private readonly from: string;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('RESEND_API_KEY') || undefined;
    this.from = config.get<string>('MAIL_FROM') ?? 'Yathra <no-reply@yathra.local>';
    if (!this.apiKey && config.get<string>('NODE_ENV') === 'production') {
      this.logger.warn('RESEND_API_KEY is not set: verification and reset emails will only be logged');
    }
  }

  async send(to: string, subject: string, text: string): Promise<void> {
    if (!this.apiKey) {
      this.logger.log(`[dev email] to=${to} subject="${subject}"\n${text}`);
      return;
    }
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: this.from, to, subject, text }),
    });
    if (!res.ok) {
      this.logger.error(`Email to ${to} failed: ${res.status} ${await res.text()}`);
    }
  }
}
