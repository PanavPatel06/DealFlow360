export default {
  server: {
    port: 5173,
    // One origin in the browser: the app calls /api/v1/... and never learns the
    // API's port. Change API_PORT if 3101 is taken.
    proxy: { '/api': { target: `http://localhost:${process.env.API_PORT ?? 3101}`, changeOrigin: true } },
  },
};
