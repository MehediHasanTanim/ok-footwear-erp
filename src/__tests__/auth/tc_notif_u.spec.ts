import { Test, TestingModule } from '@nestjs/testing';
import { SSEService } from '@modules/system/services/sse.service';
import { NotificationsService } from '@modules/system/services/notifications.service';
import { PrismaService } from '@shared/database/prisma.service';

const mockPrisma = {
  $queryRawUnsafe: jest.fn(),
  $executeRawUnsafe: jest.fn(),
};
const mockSse = { emit: jest.fn(), getOrCreateSubject: jest.fn(), removeConnection: jest.fn() };

describe('SSEService', () => {
  let sse: SSEService;
  beforeEach(() => { sse = new SSEService(); });

  it('emits event to the correct user Subject', (done) => {
    const sub = sse.getOrCreateSubject('user-1');
    sub.subscribe({ next: (e) => {
      expect(e.data).toEqual({ id: 'n1', title: 'Hello' });
      done();
    }});
    sse.emit('user-1', { id: 'n1', title: 'Hello' });
  });

  it('emit to user-A does NOT reach user-B', () => {
    const spy = jest.fn();
    sse.getOrCreateSubject('user-b').subscribe({ next: spy });
    sse.emit('user-a', { msg: 'only for A' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('removeConnection completes Subject when no connections remain', () => {
    const sub = sse.getOrCreateSubject('user-1');
    sse.removeConnection('user-1');
    expect(sub.isStopped).toBe(true);
  });

  it('removeConnection keeps Subject alive with remaining connections', () => {
    const sub = sse.getOrCreateSubject('user-1');
    sse.getOrCreateSubject('user-1'); // second connection
    sse.removeConnection('user-1');
    expect(sub.isStopped).toBe(false);
    sse.removeConnection('user-1');
    expect(sub.isStopped).toBe(true);
  });

  it('emit to unknown user is no-op', () => {
    expect(() => sse.emit('nobody', {})).not.toThrow();
  });
});

describe('NotificationsService', () => {
  let svc: NotificationsService;
  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.$queryRawUnsafe.mockResolvedValue([{ id: 'n1' }]);
    const m = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SSEService, useValue: mockSse },
      ],
    }).compile();
    svc = m.get(NotificationsService);
  });

  it('create inserts and emits SSE', async () => {
    const id = await svc.create({ userId: 'u1', title: 'T', body: 'B', type: 'alert' });
    expect(id).toBe('n1');
    expect(mockSse.emit).toHaveBeenCalledWith('u1', expect.objectContaining({ title: 'T' }));
  });

  it('getUnreadCount returns count', async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValue([{ count: BigInt(5) }]);
    expect(await svc.getUnreadCount('u1')).toBe(5);
  });

  it('markRead updates', async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValue([{ updated: BigInt(1) }]);
    expect(await svc.markRead('n1')).toBe(1);
  });
});
