self.addEventListener('notificationclick', function (event) {
  const action = event.action;
  const notification = event.notification;
  event.waitUntil((async () => {
    // Try to focus an existing client
    const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });

    let appClient = allClients.find(c => c.url && c.url.includes('/') );

    if (action && action.startsWith('snooze')) {
      // Open app with snooze param so the app can schedule a snooze reminder
      const minutes = action.split('-')[1];
      const url = '/?open=fitness&snooze=' + minutes;
      if (appClient) {
        appClient.focus();
        appClient.navigate(url);
      } else {
        clients.openWindow(url);
      }
      notification.close();
      return;
    }

    // default / open action
    const url = '/#fitness';
    if (appClient) {
      appClient.focus();
      appClient.navigate(url);
    } else {
      clients.openWindow(url);
    }
    notification.close();
  })());
});

self.addEventListener('notificationclose', function (event) {
  // Could log analytics if needed
});
