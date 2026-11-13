import { TelegramClient } from './TelegramClient';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Telegram · INVT Disparador' };

export default function TelegramPage() {
  return <TelegramClient />;
}
