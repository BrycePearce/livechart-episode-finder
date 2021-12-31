const insertNyaaLink = (card) => {
    // grab the show article and show name
    const show = card.querySelector(".anime-card");
    const showRomaji = card.getAttribute('data-romaji').split(":")[0];

    // grab elements for getting insert position and styles we can copy
    const insertAnchor = show.querySelector('div[data-anime-card-target]');
    const styleRef = card.querySelector(".anime-date");

    // create a new element to insert
    const nyaaWrapper = document.createElement("DIV");
    const nyaaRef = document.createElement("A");
    nyaaRef.href = `https://nyaa.si/?f=0&c=0_0&q=${encodeURI(showRomaji)}&o=desc&s=seeders`;

    // apply the copied styles to the new div, render into page
    copyNodeStyle(styleRef, nyaaWrapper, ["padding", "background-color", "border-bottom", "color"]);
    const textnode = document.createTextNode("Nyaa.si");
    nyaaRef.appendChild(textnode);
    nyaaWrapper.appendChild(nyaaRef);

    insertAnchor.before(nyaaWrapper);
}

const copyNodeStyle = (sourceNode, targetNode, stylesToCopy) => {
    const computedStyles = window.getComputedStyle(sourceNode);
    stylesToCopy.forEach(key => targetNode.style.setProperty(key, computedStyles.getPropertyValue(key), computedStyles.getPropertyPriority(key)));
}

document.querySelectorAll('article[data-anime-card-list-target]').forEach(card => insertNyaaLink(card));