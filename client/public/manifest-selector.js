const manifestLink = document.createElement('link');
manifestLink.rel = 'manifest';
manifestLink.href = /Android/i.test(navigator.userAgent)
  ? '/manifest.android.webmanifest'
  : '/manifest.webmanifest';
document.head.appendChild(manifestLink);
