(function() {
    const filterContainer = document.getElementById('filterContainer');
    const filterInput = document.getElementById('filterInput');
    const projectItems = document.querySelectorAll('.project-item');
    const categorySections = document.querySelectorAll('.category-section');

    let isFilterActive = false;
    let focusedIndex = -1;

    // Ensure clean state on page load (handles browser back button)
    filterContainer.classList.remove('active');
    filterInput.value = '';
    filterInput.blur();
    projectItems.forEach(item => item.classList.remove('hidden', 'focused'));
    categorySections.forEach(section => section.classList.remove('hidden'));

    // Build searchable data for each project
    const projects = Array.from(projectItems).map(item => {
        const link = item.querySelector('a');
        const title = item.querySelector('.project-title')?.textContent || '';
        const description = item.querySelector('.project-description')?.textContent || '';
        const path = item.querySelector('.project-path')?.textContent || '';
        const href = link?.getAttribute('href') || '';

        return {
            element: item,
            title: title.toLowerCase(),
            description: description.toLowerCase(),
            path: path.toLowerCase(),
            href: href,
            link: link
        };
    });

    function showFilter() {
        if (!isFilterActive) {
            isFilterActive = true;
            filterContainer.classList.add('active');
            filterInput.focus();
        }
    }

    function hideFilter() {
        if (isFilterActive) {
            isFilterActive = false;
            filterContainer.classList.remove('active');
            filterInput.value = '';
            filterInput.blur();
            filterProjects('');
        }
    }

    function clearFocus() {
        projects.forEach(p => p.element.classList.remove('focused'));
        focusedIndex = -1;
    }

    function getVisibleProjects() {
        return projects.filter(p => !p.element.classList.contains('hidden'));
    }

    function setFocus(index, visibleProjects) {
        const visible = visibleProjects || getVisibleProjects();
        projects.forEach(p => p.element.classList.remove('focused'));
        if (visible.length === 0) {
            focusedIndex = -1;
            return;
        }
        focusedIndex = ((index % visible.length) + visible.length) % visible.length;
        visible[focusedIndex].element.classList.add('focused');
        visible[focusedIndex].element.scrollIntoView({ block: 'nearest' });
    }

    function cycleFocus(direction) {
        const visible = getVisibleProjects();
        if (visible.length === 0) return;
        if (focusedIndex === -1) {
            setFocus(direction > 0 ? 0 : visible.length - 1, visible);
        } else {
            setFocus(focusedIndex + direction, visible);
        }
    }

    function filterProjects(query) {
        const lowerQuery = query.toLowerCase();

        const visibleProjects = projects.filter(project => {
            const matches = query === '' ||
                project.title.includes(lowerQuery) ||
                project.description.includes(lowerQuery) ||
                project.path.includes(lowerQuery);

            if (matches) {
                project.element.classList.remove('hidden');
            } else {
                project.element.classList.add('hidden');
            }

            return matches;
        });

        // Hide/show category sections based on visible items
        categorySections.forEach(section => {
            const items = section.querySelectorAll('.project-item');
            const hasVisible = Array.from(items).some(item => !item.classList.contains('hidden'));

            if (hasVisible || query === '') {
                section.classList.remove('hidden');
            } else {
                section.classList.add('hidden');
            }
        });

        // Reset focus when filter changes
        clearFocus();

        return visibleProjects;
    }

    function navigateToFocused() {
        const visible = getVisibleProjects();
        if (focusedIndex >= 0 && focusedIndex < visible.length) {
            window.location.href = visible[focusedIndex].href;
        } else if (visible.length === 1) {
            window.location.href = visible[0].href;
        }
    }

    // Listen for keyboard events on document
    document.addEventListener('keydown', (e) => {
        // Tab always cycles through visible tools (Shift+Tab goes backwards)
        if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            cycleFocus(e.shiftKey ? -1 : 1);
            return;
        }

        // Escape closes filter and/or clears focus
        if (e.key === 'Escape') {
            if (filterContainer.classList.contains('active')) {
                e.preventDefault();
                hideFilter();
            }
            clearFocus();
            return;
        }

        // Enter navigates to focused tool (when not typing in filter)
        if (e.key === 'Enter' && focusedIndex >= 0 &&
            document.activeElement !== filterInput) {
            e.preventDefault();
            navigateToFocused();
            return;
        }

        // Ignore remaining keys if typing in an input/textarea
        if (document.activeElement.tagName === 'INPUT' ||
            document.activeElement.tagName === 'TEXTAREA') {

            if (document.activeElement === filterInput && e.key === 'Enter') {
                e.preventDefault();
                navigateToFocused();
            }
            return;
        }

        // "/" opens the search without populating it
        if (e.key === '/') {
            e.preventDefault();
            showFilter();
            return;
        }

        // Any other printable character opens the filter and lets it populate
        if (e.key.length === 1 && e.key !== ' ' && !e.ctrlKey && !e.metaKey && !e.altKey) {
            showFilter();
        }
    });

    // Filter as user types
    filterInput.addEventListener('input', (e) => {
        filterProjects(e.target.value);
    });

    // Close filter on blur if input is empty
    filterInput.addEventListener('blur', () => {
        setTimeout(() => {
            if (isFilterActive && filterInput.value === '') {
                hideFilter();
            }
        }, 100);
    });
})();
