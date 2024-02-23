// select all notifications
const notificationList = document.querySelectorAll(
  `article[data-controller="notification"][data-notification-list-target="notification"]`
);

// Filter articles containing the "Episode Reminders" text
const episodeNotifications = Array.from(notificationList).filter((article) => {
  return Array.from(article.querySelectorAll("*")).some((element) =>
    element.textContent.toLowerCase().includes("release reminders")
  );
});

// insert nyaa
episodeNotifications.forEach((notification) => {
  const romajiWrapper = notification.querySelector(
    "[data-preferred-title-romaji]"
  );
  if (!romajiWrapper) {
    console.log("Romaji not found!");
    return;
  }

  const romajiName = cleanShowName(romajiWrapper.dataset.preferredTitleRomaji);

  // select an individual action
  const notificationAction = notification.querySelector(
    '[data-controller="notification-action"]'
  );

  // get the actions wrapper
  const notificationActions = notificationAction.closest("div");

  // create element to insert into dom
  const nyaaRef = document.createElement("A");
  nyaaRef.innerText = "Nyaa.si";
  nyaaRef.className = notificationAction.className;
  nyaaRef.setAttribute("style", notificationAction.getAttribute("style"));
  nyaaRef.href = `https://nyaa.si/?f=0&c=0_0&q=${encodeURI(
    romajiName
  )}&o=desc&s=seeders`;

  // insert into dom
  notificationActions.appendChild(nyaaRef);
});

function cleanShowName(name) {
  // Removing patterns like "-Meiji Kenkaku Romantan- (2023)"
  name = name.replace(/ -[^-]+- \(\d{4}\)/, "");

  // Removing patterns like "3rd Season", "Season 3" etc.
  name = name.replace(/\d+(st|nd|rd|th) Season/, "");
  name = name.replace(/Season \d+/, "");

  // Trim any leading or trailing spaces
  name = name.trim();

  return name;
}
