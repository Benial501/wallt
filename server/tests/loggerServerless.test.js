describe('logger in ambiente serverless', () => {
  it('non prova a creare directory o file nel filesystem Vercel', () => {
    const fs = require('fs');
    const mkdirSpy = jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {
      throw new Error('filesystem read-only');
    });
    const originalNodeEnv = process.env.NODE_ENV;
    const originalVercel = process.env.VERCEL;
    process.env.NODE_ENV = 'production';
    process.env.VERCEL = '1';

    jest.resetModules();
    expect(() => require('../utils/logger')).not.toThrow();
    expect(mkdirSpy).not.toHaveBeenCalled();

    mkdirSpy.mockRestore();
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (originalVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = originalVercel;
  });
});
