import { Test, TestingModule } from '@nestjs/testing';

import { HealthController } from '../health.controller';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  describe('GET /health', () => {
    it('returns status ok', () => {
      const result = controller.check();

      expect(result).toHaveProperty('status', 'ok');
    });

    it('returns an ISO 8601 timestamp', () => {
      const result = controller.check();

      expect(result).toHaveProperty('timestamp');
      expect(() => new Date(result.timestamp)).not.toThrow();
      expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
    });

    it('returns a positive uptime', () => {
      const result = controller.check();

      expect(result).toHaveProperty('uptime');
      expect(result.uptime).toBeGreaterThan(0);
    });
  });
});
