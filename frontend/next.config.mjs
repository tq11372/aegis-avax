export default {
  async rewrites() {
    return [
      {
        source: "/api/demo/:path*",
        destination: "http://127.0.0.1:4022/api/demo/:path*",
      },
      {
        source: "/api/v1/:path*",
        destination: "http://127.0.0.1:4021/api/v1/:path*",
      },
    ];
  },
};
