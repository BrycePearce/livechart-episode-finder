const handleClick = (card) => {
    const show = card.querySelector(".anime-card");
    const insertAnchor = show.querySelector('div[data-anime-card-target]');

    const newItem = document.createElement("DIV");
    const textnode = document.createTextNode("Water");
    newItem.appendChild(textnode);
    insertAnchor.before(newItem);
}

document.querySelectorAll('article[data-anime-card-list-target]').forEach(card => card.onclick = handleClick(card));