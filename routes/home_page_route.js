const express = require('express')
const router = express.Router()

router.get('/', checkAuthenticated, async (req, res) => {
    res.render('homePage')
})

// check if user is authenticated (if he has logged in)
function checkAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next()
    }

    return res.redirect('/login')
}

module.exports = router