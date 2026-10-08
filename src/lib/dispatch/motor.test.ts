import { describe, it, expect, afterEach } from 'vitest';
import { motorLigado, origemDoMotor } from './motor';

const original = process.env.MOTOR_WHATSAPP;
afterEach(() => {
  if (original === undefined) delete process.env.MOTOR_WHATSAPP;
  else process.env.MOTOR_WHATSAPP = original;
});

describe('motorLigado', () => {
  it('sem variável, vale o que está no código (hoje: desligado)', () => {
    delete process.env.MOTOR_WHATSAPP;
    expect(motorLigado()).toBe(false);
    expect(origemDoMotor()).toBe('codigo');
  });

  it('a variável liga, mesmo com o código desligado', () => {
    process.env.MOTOR_WHATSAPP = '1';
    expect(motorLigado()).toBe(true);
    expect(origemDoMotor()).toBe('ambiente');
  });

  it('a variável também DESLIGA — é o corte de emergência, sem esperar deploy', () => {
    process.env.MOTOR_WHATSAPP = '0';
    expect(motorLigado()).toBe(false);
    expect(origemDoMotor()).toBe('ambiente');
  });

  it('aceita as formas usuais de dizer sim', () => {
    for (const v of ['1', 'true', 'on', 'TRUE', ' On ']) {
      process.env.MOTOR_WHATSAPP = v;
      expect(motorLigado(), `valor: ${v}`).toBe(true);
    }
  });

  it('valor estranho não liga por acidente', () => {
    process.env.MOTOR_WHATSAPP = 'talvez';
    expect(motorLigado()).toBe(false);
  });
});
