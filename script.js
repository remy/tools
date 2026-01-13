(function() {
    const filterContainer = document.getElementById('filterContainer');
    const filterInput = document.getElementById('filterInput');
    const projectItems = document.querySelectorAll('.project-item');
    const categorySections = document.querySelectorAll('.category-section');

    let isFilterActive = false;

    // Ensure clean state on page load (handles browser back button)
    filterContainer.classList.remove('active');
    filterInput.value = '';
    filterInput.blur();
    projectItems.forEach(item => item.classList.remove('hidden'));
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

    function filterProjects(query) {
        const lowerQuery = query.toLowerCase();
        let visibleCount = 0;

        // Filter projects
        const visibleProjects = projects.filter(project => {
            const matches = query === '' ||
                project.title.includes(lowerQuery) ||
                project.description.includes(lowerQuery) ||
                project.path.includes(lowerQuery);

            if (matches) {
                project.element.classList.remove('hidden');
                visibleCount++;
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

        return visibleProjects;
    }

    function navigateToFirstVisible() {
        const visibleProjects = projects.filter(p => !p.element.classList.contains('hidden'));
        if (visibleProjects.length === 1) {
            window.location.href = visibleProjects[0].href;
        }
    }

    // Listen for keyboard events on document
    document.addEventListener('keydown', (e) => {
        // Handle ESC key - check DOM state instead of JS variable
        if (e.key === 'Escape' && filterContainer.classList.contains('active')) {
            e.preventDefault();
            hideFilter();
            return;
        }

        // Ignore if user is typing in an input/textarea
        if (document.activeElement.tagName === 'INPUT' ||
            document.activeElement.tagName === 'TEXTAREA') {

            // Handle special keys in filter input
            if (document.activeElement === filterInput) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    navigateToFirstVisible();
                } else if (e.key === 'Tab') {
                    e.preventDefault();
                    navigateToFirstVisible();
                }
            }
            return;
        }

        // Show filter on any printable character
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            showFilter();
            // Let the character be typed into the input
        }
    });

    // Filter as user types
    filterInput.addEventListener('input', (e) => {
        filterProjects(e.target.value);
    });

    // Prevent filter input from losing focus when clicking outside
    filterInput.addEventListener('blur', () => {
        // Small delay to allow click events to process
        setTimeout(() => {
            if (isFilterActive && filterInput.value === '') {
                hideFilter();
            }
        }, 100);
    });
})();
