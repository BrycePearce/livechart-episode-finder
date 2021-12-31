const notificationList = document.querySelector(".grouped-list").getElementsByTagName('li');

for (const notification of notificationList) {
    const insertLocation = notification.firstChild.querySelector('small');
    const showRomaji = notification.querySelector('strong').innerText.split(":")[0];

    const nyaaRef = document.createElement("A");
    nyaaRef.setAttribute('style', 'margin-left: 8px');
    nyaaRef.innerText = 'Nyaa.si';
    nyaaRef.href = `https://nyaa.si/?f=0&c=0_0&q=${encodeURI(showRomaji)}&o=desc&s=seeders`;
    insertLocation.appendChild(nyaaRef)
}